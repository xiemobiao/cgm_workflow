import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { BluetoothService } from './bluetooth.service';
import { KnownIssuesService } from '../known-issues/known-issues.service';
import { LogsService } from './logs.service';
import { EventFlowAnalyzerService } from './event-flow-analyzer.service';
import { EVENT_FLOW_TEMPLATE_VERSION } from './event-flow-templates';
import { AnalysisStatus, Prisma } from '@prisma/client';

type AnomalyDetectionResult = {
  type: string;
  severity: number;
  description: string;
  suggestion: string;
  occurrences: number;
  affectedSessions: string[];
  timeWindowMs: number;
  sampleEvents: Array<{
    id: string;
    eventName: string;
    timestampMs: number;
  }>;
};

type KnownIssueMatch = {
  issueId: string;
  title: string;
  description: string;
  solution: string;
  category: string;
  severity: number;
  matchType: string;
  confidence: number;
  eventIds: string[];
};

type QuickMetrics = {
  totalEvents: number;
  errorEvents: number;
  warningEvents: number;
  sessionCount: number;
  deviceCount: number;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  return value as Record<string, unknown>;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

@Injectable()
export class LogsAnalyzerService {
  private readonly logger = new Logger(LogsAnalyzerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly bluetoothService: BluetoothService,
    private readonly knownIssuesService: KnownIssuesService,
    private readonly eventFlowAnalyzerService: EventFlowAnalyzerService,
    @Inject(forwardRef(() => LogsService))
    private readonly logsService: LogsService,
  ) {}

  /**
   * Analyze a log file automatically after parsing
   */
  async analyzeLogFile(logFileId: string): Promise<void> {
    this.logger.log(`Starting analysis for log file: ${logFileId}`);
    let projectId: string | null = null;

    try {
      // Get log file details
      const logFile = await this.prisma.logFile.findUnique({
        where: { id: logFileId },
      });

      if (!logFile) {
        this.logger.warn(`Log file not found: ${logFileId}`);
        return;
      }
      projectId = logFile.projectId;

      // Create or update analysis record with pending status
      await this.prisma.logFileAnalysis.upsert({
        where: { logFileId },
        create: {
          logFileId,
          projectId: logFile.projectId,
          qualityScore: 0,
          status: AnalysisStatus.analyzing,
        },
        update: {
          status: AnalysisStatus.analyzing,
          errorMessage: null,
        },
      });

      // Run analysis tasks in parallel
      const [
        bleQuality,
        backendQuality,
        anomalies,
        knownIssueMatches,
        metrics,
        mainFlowAnalysis,
        eventCoverageAnalysis,
      ] = await Promise.all([
        this.analyzeBleQuality(logFileId),
        this.analyzeBackendQuality(logFileId),
        this.detectAnomalies(logFileId, logFile.projectId),
        this.matchKnownIssues(logFileId, logFile.projectId),
        this.calculateMetrics(logFileId),
        this.eventFlowAnalyzerService.analyzeMainFlow(logFileId),
        this.eventFlowAnalyzerService.analyzeEventCoverage(logFileId),
      ]);

      // Calculate overall quality score
      const qualityScore = this.computeQualityScore({
        bleQuality,
        backendQuality,
        metrics,
      });

      // Update analysis record with results
      await this.prisma.logFileAnalysis.update({
        where: { logFileId },
        data: {
          status: AnalysisStatus.completed,
          qualityScore,
          bleQuality: bleQuality as Prisma.InputJsonValue,
          backendQuality: backendQuality as Prisma.InputJsonValue,
          anomalies: anomalies as unknown as Prisma.InputJsonValue,
          knownIssueMatches:
            knownIssueMatches as unknown as Prisma.InputJsonValue,
          mainFlowAnalysis:
            mainFlowAnalysis as unknown as Prisma.InputJsonValue,
          eventCoverageAnalysis:
            eventCoverageAnalysis as unknown as Prisma.InputJsonValue,
          totalEvents: metrics.totalEvents,
          errorEvents: metrics.errorEvents,
          warningEvents: metrics.warningEvents,
          sessionCount: metrics.sessionCount,
          deviceCount: metrics.deviceCount,
          analyzedAt: new Date(),
        },
      });

      this.logger.log(
        `Analysis completed for log file: ${logFileId}, score: ${qualityScore}`,
      );
    } catch (error) {
      this.logger.error(`Analysis failed for log file: ${logFileId}`, error);

      const resolvedProjectId =
        projectId ??
        (
          await this.prisma.logFile.findUnique({
            where: { id: logFileId },
            select: { projectId: true },
          })
        )?.projectId ??
        null;
      if (!resolvedProjectId) {
        this.logger.warn(
          `Skip persisting failed analysis because log file is missing: ${logFileId}`,
        );
        return;
      }

      await this.prisma.logFileAnalysis.upsert({
        where: { logFileId },
        create: {
          logFileId,
          projectId: resolvedProjectId,
          qualityScore: 0,
          status: AnalysisStatus.failed,
          errorMessage: error instanceof Error ? error.message : String(error),
        },
        update: {
          status: AnalysisStatus.failed,
          errorMessage: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  /**
   * Recompute only event-flow related analysis with latest templates.
   * This is used to heal stale snapshots after template changes.
   */
  async refreshEventFlowAnalysis(logFileId: string): Promise<{
    mainFlowAnalysis: unknown;
    eventCoverageAnalysis: unknown;
  }> {
    const logFile = await this.prisma.logFile.findUnique({
      where: { id: logFileId },
      select: { id: true, projectId: true },
    });

    if (!logFile) {
      throw new Error(`Log file not found: ${logFileId}`);
    }

    const [mainFlowAnalysis, eventCoverageAnalysis] = await Promise.all([
      this.eventFlowAnalyzerService.analyzeMainFlow(logFileId),
      this.eventFlowAnalyzerService.analyzeEventCoverage(logFileId),
    ]);

    await this.prisma.logFileAnalysis.upsert({
      where: { logFileId },
      create: {
        logFileId,
        projectId: logFile.projectId,
        qualityScore: 0,
        status: AnalysisStatus.completed,
        mainFlowAnalysis: mainFlowAnalysis as unknown as Prisma.InputJsonValue,
        eventCoverageAnalysis:
          eventCoverageAnalysis as unknown as Prisma.InputJsonValue,
        analyzedAt: new Date(),
      },
      update: {
        status: AnalysisStatus.completed,
        errorMessage: null,
        mainFlowAnalysis: mainFlowAnalysis as unknown as Prisma.InputJsonValue,
        eventCoverageAnalysis:
          eventCoverageAnalysis as unknown as Prisma.InputJsonValue,
        analyzedAt: new Date(),
      },
    });

    return {
      mainFlowAnalysis,
      eventCoverageAnalysis,
    };
  }

  async refreshEventFlowAnalysisByProject(params: {
    projectId: string;
    limit?: number;
  }): Promise<{
    projectId: string;
    templateVersion: number;
    totalLogFiles: number;
    refreshed: number;
    failed: number;
    failedLogFileIds: string[];
  }> {
    const logFiles = await this.prisma.logFile.findMany({
      where: { projectId: params.projectId },
      select: { id: true },
      orderBy: [{ uploadedAt: 'desc' }, { id: 'desc' }],
      take: params.limit ?? 200,
    });

    let refreshed = 0;
    const failedLogFileIds: string[] = [];

    for (const logFile of logFiles) {
      try {
        await this.refreshEventFlowAnalysis(logFile.id);
        refreshed++;
      } catch (error) {
        failedLogFileIds.push(logFile.id);
        this.logger.warn(
          `Refresh event-flow failed for log file ${logFile.id}: ${String(error)}`,
        );
      }
    }

    return {
      projectId: params.projectId,
      templateVersion: EVENT_FLOW_TEMPLATE_VERSION,
      totalLogFiles: logFiles.length,
      refreshed,
      failed: failedLogFileIds.length,
      failedLogFileIds,
    };
  }

  /**
   * Analyze BLE log quality (uses existing report)
   */
  private async analyzeBleQuality(logFileId: string): Promise<unknown> {
    try {
      const logFile = await this.prisma.logFile.findUnique({
        where: { id: logFileId },
      });

      if (!logFile) return null;

      // Call existing BLE quality report
      const report = await this.logsService.getBleQualityReportInternal({
        id: logFileId,
      });

      return report;
    } catch (error) {
      this.logger.warn(`BLE quality analysis failed: ${error}`);
      return null;
    }
  }

  /**
   * Analyze backend quality (HTTP, MQTT)
   */
  private async analyzeBackendQuality(logFileId: string): Promise<unknown> {
    try {
      const logFile = await this.prisma.logFile.findUnique({
        where: { id: logFileId },
      });

      if (!logFile) return null;

      // Call existing backend quality report
      const report = await this.logsService.getBackendQualityReportInternal({
        id: logFileId,
      });

      return report;
    } catch (error) {
      this.logger.warn(`Backend quality analysis failed: ${error}`);
      return null;
    }
  }

  /**
   * Detect anomalies in log file
   */
  private async detectAnomalies(
    logFileId: string,
    projectId: string,
  ): Promise<AnomalyDetectionResult[]> {
    try {
      // Get log file time range
      const logFile = await this.prisma.logFile.findUnique({
        where: { id: logFileId },
        include: {
          events: {
            orderBy: { timestampMs: 'asc' },
            take: 1,
          },
        },
      });

      if (!logFile || logFile.events.length === 0) return [];

      const lastEvent = await this.prisma.logEvent.findFirst({
        where: { logFileId },
        orderBy: { timestampMs: 'desc' },
        take: 1,
      });

      if (!lastEvent) return [];

      const startTime = new Date(Number(logFile.events[0].timestampMs));
      const endTime = new Date(Number(lastEvent.timestampMs));

      // Call existing anomaly detection
      const result =
        await this.bluetoothService.detectAnomaliesEnhancedInternal({
          projectId,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
        });

      return result.anomalies as AnomalyDetectionResult[];
    } catch (error) {
      this.logger.warn(`Anomaly detection failed: ${error}`);
      return [];
    }
  }

  /**
   * Match known issues in log file
   */
  private async matchKnownIssues(
    logFileId: string,
    projectId: string,
  ): Promise<KnownIssueMatch[]> {
    try {
      // Get error and warning events
      const events = await this.prisma.logEvent.findMany({
        where: {
          logFileId,
          level: { gte: 3 }, // WARN and ERROR
        },
        take: 100, // Limit to first 100 issues for performance
        select: {
          id: true,
          eventName: true,
          errorCode: true,
          msgJson: true,
        },
      });

      if (events.length === 0) return [];

      // Match each event against known issues
      const matches: KnownIssueMatch[] = [];
      const issueEventMap = new Map<string, string[]>();

      for (const event of events) {
        const msg =
          typeof event.msgJson === 'object' && event.msgJson !== null
            ? JSON.stringify(event.msgJson)
            : String(event.msgJson ?? '');

        const result = await this.knownIssuesService.matchEventInternal({
          projectId,
          eventName: event.eventName,
          errorCode: event.errorCode ?? undefined,
          msg,
        });

        // Aggregate matches by issue ID
        for (const match of result.matches) {
          const eventIds = issueEventMap.get(match.id) ?? [];
          eventIds.push(event.id);
          issueEventMap.set(match.id, eventIds);

          // Add or update match
          const existingMatch = matches.find((m) => m.issueId === match.id);
          if (!existingMatch) {
            matches.push({
              issueId: match.id,
              title: match.title,
              description: match.description,
              solution: match.solution,
              category: match.category,
              severity: match.severity,
              matchType: match.matchType,
              confidence: match.confidence,
              eventIds,
            });
          }
        }
      }

      // Sort by severity (descending) and confidence (descending)
      return matches.sort(
        (a, b) => b.severity - a.severity || b.confidence - a.confidence,
      );
    } catch (error) {
      this.logger.warn(`Known issue matching failed: ${error}`);
      return [];
    }
  }

  /**
   * Calculate quick metrics
   */
  private async calculateMetrics(logFileId: string): Promise<QuickMetrics> {
    const [totalEvents, errorEvents, warningEvents, sessionCount, deviceCount] =
      await Promise.all([
        this.prisma.logEvent.count({ where: { logFileId } }),
        this.prisma.logEvent.count({
          where: { logFileId, level: 4 },
        }),
        this.prisma.logEvent.count({
          where: { logFileId, level: 3 },
        }),
        this.prisma.logEvent
          .findMany({
            where: { logFileId, linkCode: { not: null } },
            select: { linkCode: true },
            distinct: ['linkCode'],
          })
          .then((rows) => rows.length),
        this.prisma.logEvent
          .findMany({
            where: {
              logFileId,
              deviceMac: { not: null },
            },
            select: { deviceMac: true },
            distinct: ['deviceMac'],
          })
          .then((rows) => rows.length),
      ]);

    return {
      totalEvents,
      errorEvents,
      warningEvents,
      sessionCount,
      deviceCount,
    };
  }

  /**
   * Compute overall quality score (0-100)
   */
  private computeQualityScore(params: {
    bleQuality: unknown;
    backendQuality: unknown;
    metrics: QuickMetrics;
  }): number {
    const { bleQuality, backendQuality, metrics } = params;

    let score = 100;

    // BLE quality deduction (max -40 points)
    if (bleQuality) {
      const ble = asRecord(bleQuality);
      const bleSummary = ble ? asRecord(ble.summary) : null;
      const coverageRatio = bleSummary
        ? (asNumber(bleSummary.coverageRatio) ?? 1)
        : 1;
      score -= Math.round((1 - coverageRatio) * 40);

      const parser = ble ? asRecord(ble.parser) : null;
      const parserErrorCount = parser
        ? (asNumber(parser.parserErrorCount) ?? 0)
        : 0;
      if (parserErrorCount > 0) {
        score -= Math.min(10, parserErrorCount);
      }

      const logan = parser ? asRecord(parser.logan) : null;
      const blocksFailed = logan ? (asNumber(logan.blocksFailed) ?? 0) : 0;
      const blocksTotal = logan ? (asNumber(logan.blocksTotal) ?? 0) : 0;
      if (blocksTotal > 0 && blocksFailed > 0) {
        const loganFailRate = blocksFailed / Math.max(1, blocksTotal);
        score -= Math.round(loganFailRate * 10);
      }
    }

    // Backend quality deduction (max -20 points)
    if (backendQuality) {
      // Use summary.http instead of http directly
      const backend = asRecord(backendQuality);
      const backendSummary = backend ? asRecord(backend.summary) : null;
      const httpSummary = backendSummary ? asRecord(backendSummary.http) : null;
      if (httpSummary) {
        const total = asNumber(httpSummary.total) ?? 0;
        const success = asNumber(httpSummary.success) ?? 0;
        const httpSuccessRate = total > 0 ? (success / total) * 100 : 100;
        const httpFailRate = 1 - httpSuccessRate / 100;
        score -= Math.round(httpFailRate * 10);
      }

      // Use mqtt.issuesByDevice instead of mqtt.issues
      const mqtt = backend ? asRecord(backend.mqtt) : null;
      const issuesByDevice = mqtt ? mqtt.issuesByDevice : null;
      const mqttIssuesCount = Array.isArray(issuesByDevice)
        ? issuesByDevice.length
        : 0;
      score -= Math.min(10, mqttIssuesCount);
    }

    // Error rate deduction (max -40 points)
    if (metrics.totalEvents > 0) {
      const errorRate = metrics.errorEvents / metrics.totalEvents;
      const warningRate = metrics.warningEvents / metrics.totalEvents;
      score -= Math.round(errorRate * 30);
      score -= Math.round(warningRate * 10);
    }

    // Ensure score is in range [0, 100]
    return Math.max(0, Math.min(100, Math.round(score)));
  }
}
