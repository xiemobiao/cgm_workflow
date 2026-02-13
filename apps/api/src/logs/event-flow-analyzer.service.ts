import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import {
  MAIN_FLOW_TEMPLATE,
  BLE_KNOWN_EVENTS,
  type EventFlowStage,
} from './event-flow-templates';
import type {
  MainFlowAnalysisResult,
  StageAnalysisResult,
  EventAnalysisResult,
  SessionAnalysis,
  StageTiming,
  StageIssue,
  EventCoverageAnalysisResult,
  CategoryCoverageResult,
  EventCoverageResult,
  ExtraEventResult,
} from './event-flow-types';

type SessionEventRow = {
  id: string;
  eventName: string;
  timestampMs: bigint;
  deviceMac: string | null;
  attemptId: string | null;
};

type StageDurationCandidate = {
  startTime: number;
  endTime: number;
  durationMs: number;
};

/**
 * Event Flow Analyzer Service
 *
 * Analyzes log files to:
 * 1. Track the main flow (SDK initialization → real-time data)
 * 2. Calculate event coverage for all known BLE events
 */
@Injectable()
export class EventFlowAnalyzerService {
  private readonly logger = new Logger(EventFlowAnalyzerService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Analyze main flow for a log file
   *
   * Tracks the complete event chain from SDK initialization to receiving real-time data.
   */
  async analyzeMainFlow(logFileId: string): Promise<MainFlowAnalysisResult> {
    this.logger.log(`Analyzing main flow for log file: ${logFileId}`);

    // Get all unique linkCodes (sessions)
    const linkCodes = await this.prisma.logEvent
      .findMany({
        where: {
          logFileId,
          linkCode: { not: null },
        },
        select: { linkCode: true },
        distinct: ['linkCode'],
      })
      .then((rows) => rows.map((r) => r.linkCode as string));

    if (linkCodes.length === 0) {
      // No sessions found, return empty result
      return this.getEmptyMainFlowResult();
    }

    this.logger.log(`Found ${linkCodes.length} sessions to analyze`);

    // Load all session events in one query to avoid N+1 database round trips.
    const allSessionEvents = await this.prisma.logEvent.findMany({
      where: {
        logFileId,
        linkCode: { in: linkCodes },
      },
      orderBy: [{ linkCode: 'asc' }, { timestampMs: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        eventName: true,
        timestampMs: true,
        deviceMac: true,
        attemptId: true,
        linkCode: true,
      },
    });

    const eventsByLinkCode = new Map<string, SessionEventRow[]>();
    for (const event of allSessionEvents) {
      if (!event.linkCode) continue;
      const bucket = eventsByLinkCode.get(event.linkCode) ?? [];
      bucket.push({
        id: event.id,
        eventName: event.eventName,
        timestampMs: event.timestampMs,
        deviceMac: event.deviceMac,
        attemptId: event.attemptId,
      });
      eventsByLinkCode.set(event.linkCode, bucket);
    }

    // Analyze each session
    const sessionAnalyses: SessionAnalysis[] = [];
    for (const linkCode of linkCodes) {
      const analysis = this.analyzeSession(
        linkCode,
        eventsByLinkCode.get(linkCode) ?? [],
      );
      sessionAnalyses.push(analysis);
    }

    // Aggregate results
    const result = this.aggregateSessionAnalyses(sessionAnalyses);

    this.logger.log(
      `Main flow analysis completed: ${result.completedSessions}/${result.totalSessions} sessions completed`,
    );

    return result;
  }

  /**
   * Analyze a single session (linkCode)
   */
  private analyzeSession(
    linkCode: string,
    events: SessionEventRow[],
  ): SessionAnalysis {
    if (events.length === 0) {
      return this.getEmptySessionAnalysis(linkCode);
    }

    const deviceMac = events.find((e) => e.deviceMac)?.deviceMac ?? null;
    const stageTimings: StageTiming[] = [];
    const missedEvents: string[] = [];
    let stagesCompleted = 0;
    let completed = true;

    // Analyze each stage
    for (const stage of MAIN_FLOW_TEMPLATE.stages) {
      const stageTiming = this.analyzeStage(stage.id, events);
      stageTimings.push(stageTiming);

      if (stageTiming.completed) {
        stagesCompleted++;
      } else if (stage.required) {
        completed = false;
        // Find missing required events
        for (const stageEvent of stage.events) {
          if (
            stageEvent.required &&
            !stageTiming.events.some(
              (e) => e.eventName === stageEvent.eventName,
            )
          ) {
            missedEvents.push(stageEvent.eventName);
          }
        }
      }
    }

    const totalDurationMs =
      stageTimings[0]?.startTime &&
      stageTimings[stageTimings.length - 1]?.endTime
        ? Number(stageTimings[stageTimings.length - 1].endTime) -
          Number(stageTimings[0].startTime)
        : null;

    const coverageRate =
      MAIN_FLOW_TEMPLATE.stages.length > 0
        ? (stagesCompleted / MAIN_FLOW_TEMPLATE.stages.length) * 100
        : 0;

    return {
      linkCode,
      deviceMac,
      totalDurationMs,
      completed,
      stagesCompleted,
      coverageRate,
      stageTimings,
      missedEvents,
    };
  }

  /**
   * Analyze a single stage within a session
   */
  private analyzeStage(
    stageId: string,
    events: SessionEventRow[],
  ): StageTiming {
    const stage = MAIN_FLOW_TEMPLATE.stages.find((s) => s.id === stageId);
    if (!stage) {
      return {
        stageId,
        stageName: 'Unknown',
        startTime: null,
        endTime: null,
        durationMs: null,
        attemptDurationsMs: [],
        completed: false,
        events: [],
      };
    }

    // Find all events that belong to this stage
    const stageEventNames = stage.events.map((e) => e.eventName);
    const matchedEvents = events.filter((e) =>
      stageEventNames.includes(e.eventName),
    );

    if (matchedEvents.length === 0) {
      return {
        stageId,
        stageName: stage.name,
        startTime: null,
        endTime: null,
        durationMs: null,
        attemptDurationsMs: [],
        completed: false,
        events: [],
      };
    }

    // Check if all required events are present
    const requiredEvents = stage.events.filter((e) => e.required);
    const allRequiredPresent = requiredEvents.every((reqEvent) =>
      matchedEvents.some((e) => e.eventName === reqEvent.eventName),
    );

    const durationSummary = this.resolveStageDuration(stage, matchedEvents);
    const startTime = durationSummary?.selected.startTime ?? null;
    const endTime = durationSummary?.selected.endTime ?? null;
    const durationMs = durationSummary?.selected.durationMs ?? null;
    const attemptDurationsMs =
      durationSummary?.candidates.map((d) => d.durationMs) ??
      (durationMs !== null ? [durationMs] : []);

    return {
      stageId,
      stageName: stage.name,
      startTime,
      endTime,
      durationMs,
      attemptDurationsMs,
      completed: allRequiredPresent,
      events: matchedEvents.map((e) => ({
        eventName: e.eventName,
        timestampMs: Number(e.timestampMs),
      })),
    };
  }

  private resolveStageDuration(
    stage: EventFlowStage,
    matchedEvents: SessionEventRow[],
  ): {
    selected: StageDurationCandidate;
    candidates: StageDurationCandidate[];
  } | null {
    if (matchedEvents.length === 0) return null;

    const startEventName = stage.events[0]?.eventName;
    const endEventNames = new Set(
      stage.events.slice(1).map((e) => e.eventName),
    );

    if (!startEventName || endEventNames.size === 0) {
      const fallback = this.getRangeDuration(matchedEvents);
      return {
        selected: fallback,
        candidates: [fallback],
      };
    }

    const attemptCandidates = this.getAttemptDurationCandidates(
      matchedEvents,
      startEventName,
      endEventNames,
    );
    const candidates =
      attemptCandidates.length > 0
        ? attemptCandidates
        : this.getSequentialDurationCandidates(
            matchedEvents,
            startEventName,
            endEventNames,
          );

    if (candidates.length > 0) {
      return {
        selected: candidates.reduce((longest, current) =>
          current.durationMs > longest.durationMs ? current : longest,
        ),
        candidates,
      };
    }

    const fallback = this.getRangeDuration(matchedEvents);
    return {
      selected: fallback,
      candidates: [fallback],
    };
  }

  private getAttemptDurationCandidates(
    matchedEvents: SessionEventRow[],
    startEventName: string,
    endEventNames: Set<string>,
  ): StageDurationCandidate[] {
    const eventsByAttemptId = new Map<string, SessionEventRow[]>();
    for (const event of matchedEvents) {
      if (!event.attemptId) continue;
      const bucket = eventsByAttemptId.get(event.attemptId) ?? [];
      bucket.push(event);
      eventsByAttemptId.set(event.attemptId, bucket);
    }

    const candidates: StageDurationCandidate[] = [];

    for (const attemptEvents of eventsByAttemptId.values()) {
      let pendingStartTime: number | null = null;
      for (const event of attemptEvents) {
        const timestamp = Number(event.timestampMs);
        if (event.eventName === startEventName) {
          pendingStartTime = timestamp;
          continue;
        }
        if (
          pendingStartTime !== null &&
          endEventNames.has(event.eventName) &&
          timestamp >= pendingStartTime
        ) {
          candidates.push({
            startTime: pendingStartTime,
            endTime: timestamp,
            durationMs: timestamp - pendingStartTime,
          });
          pendingStartTime = null;
        }
      }
    }

    return candidates;
  }

  private getSequentialDurationCandidates(
    matchedEvents: SessionEventRow[],
    startEventName: string,
    endEventNames: Set<string>,
  ): StageDurationCandidate[] {
    const candidates: StageDurationCandidate[] = [];
    let pendingStartTime: number | null = null;

    for (const event of matchedEvents) {
      const timestamp = Number(event.timestampMs);
      if (event.eventName === startEventName) {
        pendingStartTime = timestamp;
        continue;
      }
      if (
        pendingStartTime !== null &&
        endEventNames.has(event.eventName) &&
        timestamp >= pendingStartTime
      ) {
        candidates.push({
          startTime: pendingStartTime,
          endTime: timestamp,
          durationMs: timestamp - pendingStartTime,
        });
        pendingStartTime = null;
      }
    }

    return candidates;
  }

  private getRangeDuration(
    matchedEvents: SessionEventRow[],
  ): StageDurationCandidate {
    const startTime = Number(matchedEvents[0].timestampMs);
    const endTime = Number(matchedEvents[matchedEvents.length - 1].timestampMs);
    return {
      startTime,
      endTime,
      durationMs: Math.max(0, endTime - startTime),
    };
  }

  /**
   * Aggregate session analyses into overall result
   */
  private aggregateSessionAnalyses(
    sessions: SessionAnalysis[],
  ): MainFlowAnalysisResult {
    if (sessions.length === 0) {
      return this.getEmptyMainFlowResult();
    }

    const totalSessions = sessions.length;
    const completedSessions = sessions.filter((s) => s.completed).length;
    const completionRate =
      totalSessions > 0 ? (completedSessions / totalSessions) * 100 : 0;

    const completedDurations = sessions
      .filter((s) => s.completed && s.totalDurationMs !== null)
      .map((s) => s.totalDurationMs as number);

    const avgTotalDurationMs =
      completedDurations.length > 0
        ? completedDurations.reduce((a, b) => a + b, 0) /
          completedDurations.length
        : null;

    // Aggregate stage results
    const stages: StageAnalysisResult[] = MAIN_FLOW_TEMPLATE.stages.map(
      (stage) => {
        const eventResults: EventAnalysisResult[] = stage.events.map(
          (event) => {
            const sessionHitCount = sessions.filter((s) =>
              s.stageTimings
                .find((t) => t.stageId === stage.id)
                ?.events.some((e) => e.eventName === event.eventName),
            ).length;

            const occurrenceCount = sessions.reduce((count, s) => {
              const stageEvents =
                s.stageTimings.find((t) => t.stageId === stage.id)?.events ??
                [];
              return (
                count +
                stageEvents.filter((e) => e.eventName === event.eventName)
                  .length
              );
            }, 0);

            const missedCount = totalSessions - sessionHitCount;
            const hitRate =
              totalSessions > 0 ? (sessionHitCount / totalSessions) * 100 : 0;

            return {
              eventName: event.eventName,
              required: event.required,
              occurrenceCount,
              sessionHitCount,
              missedCount,
              hitRate,
            };
          },
        );

        // Calculate stage coverage
        const sessionsCovered = sessions.filter((s) => {
          const stageTiming = s.stageTimings.find(
            (t) => t.stageId === stage.id,
          );
          return stageTiming && stageTiming.events.length > 0;
        }).length;

        const coverageRate =
          totalSessions > 0 ? (sessionsCovered / totalSessions) * 100 : 0;

        // Calculate durations from every matched attempt (not session count).
        const attemptDurations = sessions.flatMap((s) => {
          const stageTiming = s.stageTimings.find(
            (t) => t.stageId === stage.id,
          );
          if (!stageTiming) return [];
          if (stageTiming.attemptDurationsMs.length > 0) {
            return stageTiming.attemptDurationsMs;
          }
          return typeof stageTiming.durationMs === 'number'
            ? [stageTiming.durationMs]
            : [];
        });

        const avgDurationMs =
          attemptDurations.length > 0
            ? attemptDurations.reduce((a, b) => a + b, 0) /
              attemptDurations.length
            : null;

        const maxObservedDurationMs =
          attemptDurations.length > 0 ? Math.max(...attemptDurations) : null;
        const minDurationMs =
          attemptDurations.length > 0 ? Math.min(...attemptDurations) : null;

        // Detect issues
        const issues: StageIssue[] = [];

        // Timeout issues
        if (
          stage.maxDurationMs &&
          maxObservedDurationMs &&
          maxObservedDurationMs > stage.maxDurationMs
        ) {
          const affectedSessions = sessions
            .filter((s) => {
              const d = s.stageTimings.find(
                (t) => t.stageId === stage.id,
              )?.durationMs;
              return d !== null && d !== undefined && d > stage.maxDurationMs!;
            })
            .map((s) => s.linkCode);

          issues.push({
            type: 'timeout',
            severity: 3,
            description: `阶段耗时超过预期 (最大: ${maxObservedDurationMs}ms, 预期: ${stage.maxDurationMs}ms)`,
            affectedSessions,
          });
        }

        // Missing required events
        const missingRequired = eventResults.filter(
          (e) => e.required && e.missedCount > 0,
        );
        for (const event of missingRequired) {
          const affectedSessions = sessions
            .filter((s) => s.missedEvents.includes(event.eventName))
            .map((s) => s.linkCode);

          issues.push({
            type: 'missing_event',
            severity: 4,
            description: `缺失必需事件: ${event.eventName} (${event.missedCount} 个会话)`,
            affectedSessions,
          });
        }

        return {
          stageId: stage.id,
          stageName: stage.name,
          required: stage.required,
          maxDurationMs: stage.maxDurationMs ?? null,
          sessionsCovered,
          coverageRate,
          avgDurationMs,
          maxObservedDurationMs,
          minDurationMs,
          events: eventResults,
          issues,
        };
      },
    );

    // Sample sessions (up to 5)
    const sampleSessions = sessions.slice(0, 5);

    return {
      templateId: MAIN_FLOW_TEMPLATE.id,
      templateName: MAIN_FLOW_TEMPLATE.name,
      totalSessions,
      completedSessions,
      completionRate,
      avgTotalDurationMs,
      stages,
      sampleSessions,
    };
  }

  /**
   * Analyze event coverage for a log file
   *
   * Checks which known events appeared in the log and calculates coverage rate.
   */
  async analyzeEventCoverage(
    logFileId: string,
  ): Promise<EventCoverageAnalysisResult> {
    this.logger.log(`Analyzing event coverage for log file: ${logFileId}`);

    // Get total event count
    const totalEvents = await this.prisma.logEvent.count({
      where: { logFileId },
    });

    // Get event statistics from LogEventStats
    const eventStats = await this.prisma.logEventStats.findMany({
      where: { logFileId },
      select: {
        eventName: true,
        count: true,
      },
    });

    // Build event name -> count map
    const eventCountMap = new Map<string, number>();
    for (const stat of eventStats) {
      const existing = eventCountMap.get(stat.eventName) ?? 0;
      eventCountMap.set(stat.eventName, existing + stat.count);
    }

    // Analyze each category
    const byCategory: CategoryCoverageResult[] = [];
    let totalCovered = 0;
    let totalMissing = 0;

    for (const category of BLE_KNOWN_EVENTS) {
      const events: EventCoverageResult[] = [];
      let categoryCovered = 0;
      let categoryMissing = 0;

      for (const knownEvent of category.events) {
        const count = eventCountMap.get(knownEvent.eventName) ?? 0;
        const covered = count > 0;

        if (covered) {
          categoryCovered++;
          totalCovered++;
        } else {
          categoryMissing++;
          totalMissing++;
        }

        events.push({
          eventName: knownEvent.eventName,
          level: knownEvent.level,
          description: knownEvent.description,
          covered,
          occurrenceCount: count,
        });
      }

      const coverageRate =
        category.events.length > 0
          ? (categoryCovered / category.events.length) * 100
          : 0;

      byCategory.push({
        category: category.category,
        totalCount: category.events.length,
        coveredCount: categoryCovered,
        missingCount: categoryMissing,
        coverageRate,
        events,
      });
    }

    // Find extra events (not in known list)
    const knownEventNames = new Set<string>();
    for (const category of BLE_KNOWN_EVENTS) {
      for (const event of category.events) {
        knownEventNames.add(event.eventName);
      }
    }

    const extraEvents: ExtraEventResult[] = [];
    for (const [eventName, count] of eventCountMap) {
      if (!knownEventNames.has(eventName)) {
        extraEvents.push({
          eventName,
          occurrenceCount: count,
        });
      }
    }

    // Sort extra events by count (descending)
    extraEvents.sort((a, b) => b.occurrenceCount - a.occurrenceCount);

    const knownEventsCount = totalCovered + totalMissing;
    const coverageRate =
      knownEventsCount > 0 ? (totalCovered / knownEventsCount) * 100 : 0;

    this.logger.log(
      `Event coverage analysis completed: ${totalCovered}/${knownEventsCount} events covered (${coverageRate.toFixed(1)}%)`,
    );

    return {
      totalEvents,
      knownEventsCount,
      summary: {
        coveredCount: totalCovered,
        missingCount: totalMissing,
        coverageRate,
      },
      byCategory,
      extraEvents,
    };
  }

  /**
   * Get empty main flow result (no sessions found)
   */
  private getEmptyMainFlowResult(): MainFlowAnalysisResult {
    return {
      templateId: MAIN_FLOW_TEMPLATE.id,
      templateName: MAIN_FLOW_TEMPLATE.name,
      totalSessions: 0,
      completedSessions: 0,
      completionRate: 0,
      avgTotalDurationMs: null,
      stages: MAIN_FLOW_TEMPLATE.stages.map((stage) => ({
        stageId: stage.id,
        stageName: stage.name,
        required: stage.required,
        maxDurationMs: stage.maxDurationMs ?? null,
        sessionsCovered: 0,
        coverageRate: 0,
        avgDurationMs: null,
        maxObservedDurationMs: null,
        minDurationMs: null,
        events: stage.events.map((event) => ({
          eventName: event.eventName,
          required: event.required,
          occurrenceCount: 0,
          sessionHitCount: 0,
          missedCount: 0,
          hitRate: 0,
        })),
        issues: [],
      })),
      sampleSessions: [],
    };
  }

  /**
   * Get empty session analysis
   */
  private getEmptySessionAnalysis(linkCode: string): SessionAnalysis {
    return {
      linkCode,
      deviceMac: null,
      totalDurationMs: null,
      completed: false,
      stagesCompleted: 0,
      coverageRate: 0,
      stageTimings: MAIN_FLOW_TEMPLATE.stages.map((stage) => ({
        stageId: stage.id,
        stageName: stage.name,
        startTime: null,
        endTime: null,
        durationMs: null,
        attemptDurationsMs: [],
        completed: false,
        events: [],
      })),
      missedEvents: [],
    };
  }
}
