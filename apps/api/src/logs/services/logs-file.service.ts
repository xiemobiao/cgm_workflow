import { Injectable } from '@nestjs/common';
import { LogFileStatus, Prisma } from '@prisma/client';
import { ApiException } from '../../common/api-exception';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../database/prisma.service';
import { RbacService } from '../../rbac/rbac.service';
import { StorageService } from '../../storage/storage.service';
import { LogProcessingService } from '../log-processing.service';
import { LogsHelperService } from './logs-helper.service';
import { buildBleQualityReport, type LoganDecryptStats } from '../ble-quality';
import { buildBackendQualityReport } from '../backend-quality';
import { buildDataContinuityReport } from '../data-continuity';
import { buildStreamSessionQualityReport } from '../stream-session-quality';

/**
 * Service for log file operations: upload, list, delete, detail, and quality reports.
 */
@Injectable()
export class LogsFileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    private readonly helper: LogsHelperService,
    private readonly processing: LogProcessingService,
  ) {}

  private extractLoganDecryptStatsFromMsgJson(
    msgJson: unknown,
  ): LoganDecryptStats | null {
    if (!msgJson || typeof msgJson !== 'object') return null;
    const record = msgJson as Record<string, unknown>;
    const logan = record.logan;
    if (!logan || typeof logan !== 'object') return null;
    const loganRecord = logan as Record<string, unknown>;

    const blocksTotal =
      typeof loganRecord.blocksTotal === 'number'
        ? loganRecord.blocksTotal
        : null;
    const blocksSucceeded =
      typeof loganRecord.blocksSucceeded === 'number'
        ? loganRecord.blocksSucceeded
        : null;
    const blocksFailed =
      typeof loganRecord.blocksFailed === 'number'
        ? loganRecord.blocksFailed
        : null;

    if (
      blocksTotal === null ||
      blocksSucceeded === null ||
      blocksFailed === null
    ) {
      return null;
    }

    return { blocksTotal, blocksSucceeded, blocksFailed };
  }

  private normalizeOptionalValue(value: unknown) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private normalizeCount(value: unknown) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'bigint') return Number(value);
    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  }

  private toPercent(part: number, total: number) {
    if (total <= 0) return 0;
    return Math.round((part / total) * 10000) / 100;
  }

  private classifyReasonCode(reasonCode: string) {
    const code = reasonCode.toUpperCase();
    if (code.includes('TIMEOUT') || code.includes('TIME_OUT')) {
      return 'timeout';
    }
    if (
      code.includes('PERMISSION') ||
      code.includes('AUTH') ||
      code.includes('TOKEN') ||
      code.includes('DENIED')
    ) {
      return 'permission';
    }
    if (
      code.includes('BLE') ||
      code.includes('GATT') ||
      code.includes('SCAN') ||
      code.includes('CONNECT') ||
      code.includes('BOND') ||
      code.includes('PAIR')
    ) {
      return 'bluetooth';
    }
    if (
      code.includes('HTTP') ||
      code.includes('MQTT') ||
      code.includes('NETWORK') ||
      code.includes('SOCKET') ||
      code.includes('SERVER') ||
      code.includes('DNS')
    ) {
      return 'network';
    }
    if (
      code.includes('DATA') ||
      code.includes('INDEX') ||
      code.includes('UPLOAD') ||
      code.includes('ACK')
    ) {
      return 'data';
    }
    if (
      code.includes('DISCONNECT') ||
      code.includes('LINK') ||
      code.includes('SESSION')
    ) {
      return 'session';
    }
    if (
      code.includes('DEVICE') ||
      code.includes('SN') ||
      code.includes('MAC')
    ) {
      return 'device';
    }
    return 'unknown';
  }

  async upload(params: {
    actorUserId: string;
    projectId: string;
    file: Express.Multer.File;
    fileName?: string;
  }) {
    await this.rbac.requireProjectRoles({
      userId: params.actorUserId,
      projectId: params.projectId,
      allowed: ['Admin', 'Dev', 'QA', 'Support'],
    });

    if (!params.file?.buffer) {
      throw new ApiException({
        code: 'LOG_FILE_REQUIRED',
        message: 'Log file is required',
        status: 400,
      });
    }

    const fileName =
      params.fileName?.trim() || params.file.originalname || 'logs.jsonl';
    const uploadedAt = new Date();

    const logFile = await this.prisma.logFile.create({
      data: {
        projectId: params.projectId,
        fileName,
        fileSize: BigInt(params.file.size ?? params.file.buffer.length),
        status: LogFileStatus.queued,
        storageKey: '',
        parserVersion: 'v1',
        uploadedAt,
      },
    });

    const storageKey = `logs/${params.projectId}/${logFile.id}.jsonl`;
    await this.storage.putObject({
      key: storageKey,
      body: params.file.buffer,
      contentType: params.file.mimetype,
    });

    await this.prisma.logFile.update({
      where: { id: logFile.id },
      data: { storageKey },
    });

    await this.audit.record({
      projectId: params.projectId,
      actorUserId: params.actorUserId,
      action: 'logs.upload',
      targetType: 'LogFile',
      targetId: logFile.id,
      metadata: { fileName, fileSize: params.file.size },
    });

    try {
      await this.processing.enqueueLogFileProcessing(logFile.id);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await this.prisma.logFile.update({
        where: { id: logFile.id },
        data: { status: LogFileStatus.failed },
      });
      await this.audit.record({
        projectId: params.projectId,
        actorUserId: params.actorUserId,
        action: 'logs.enqueue.failed',
        targetType: 'LogFile',
        targetId: logFile.id,
        metadata: { message },
      });
      throw new ApiException({
        code: 'LOG_PROCESSING_ENQUEUE_FAILED',
        message: 'Failed to enqueue log processing',
        status: 500,
      });
    }

    return { logFileId: logFile.id, status: logFile.status };
  }

  async listLogFiles(params: {
    actorUserId: string;
    projectId: string;
    limit?: number;
    cursor?: string;
  }) {
    await this.rbac.requireProjectRoles({
      userId: params.actorUserId,
      projectId: params.projectId,
      allowed: ['Admin', 'PM', 'Dev', 'QA', 'Release', 'Support', 'Viewer'],
    });

    const limit = Math.min(Math.max(params.limit ?? 20, 1), 100);

    const andFilters: Prisma.LogFileWhereInput[] = [
      { projectId: params.projectId },
    ];
    if (params.cursor) {
      const cursor = this.helper.decodeFileCursor(params.cursor);
      andFilters.push({
        OR: [
          { uploadedAt: { lt: cursor.uploadedAt } },
          {
            AND: [{ uploadedAt: cursor.uploadedAt }, { id: { lt: cursor.id } }],
          },
        ],
      });
    }

    const rows = await this.prisma.logFile.findMany({
      where: { AND: andFilters },
      orderBy: [{ uploadedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: {
        id: true,
        fileName: true,
        status: true,
        parserVersion: true,
        uploadedAt: true,
        analysis: {
          select: {
            qualityScore: true,
            status: true,
          },
        },
      },
    });

    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    const nextCursor =
      hasMore && page.length > 0
        ? this.helper.encodeFileCursor({
            id: page[page.length - 1].id,
            uploadedAt: page[page.length - 1].uploadedAt,
          })
        : null;

    const ids = page.map((f) => f.id);
    const [eventCounts, errorCounts] = await Promise.all([
      ids.length
        ? this.prisma.logEvent.groupBy({
            by: ['logFileId'],
            where: { logFileId: { in: ids } },
            _count: { _all: true },
          })
        : Promise.resolve([]),
      ids.length
        ? this.prisma.logEvent.groupBy({
            by: ['logFileId'],
            where: { logFileId: { in: ids }, eventName: 'PARSER_ERROR' },
            _count: { _all: true },
          })
        : Promise.resolve([]),
    ]);

    const eventCountByFile = new Map<string, number>();
    for (const row of eventCounts) {
      eventCountByFile.set(row.logFileId, row._count._all);
    }
    const errorCountByFile = new Map<string, number>();
    for (const row of errorCounts) {
      errorCountByFile.set(row.logFileId, row._count._all);
    }

    return {
      items: page.map((f) => ({
        id: f.id,
        fileName: f.fileName,
        status: f.status,
        parserVersion: f.parserVersion,
        uploadedAt: f.uploadedAt,
        eventCount: eventCountByFile.get(f.id) ?? 0,
        errorCount: errorCountByFile.get(f.id) ?? 0,
        qualityScore: f.analysis?.qualityScore ?? null,
        analysisStatus: f.analysis?.status ?? null,
      })),
      nextCursor,
    };
  }

  async deleteLogFile(params: { actorUserId: string; id: string }) {
    const logFile = await this.prisma.logFile.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        projectId: true,
        fileName: true,
        storageKey: true,
      },
    });

    if (!logFile) {
      throw new ApiException({
        code: 'LOG_FILE_NOT_FOUND',
        message: 'Log file not found',
        status: 404,
      });
    }

    await this.rbac.requireProjectRoles({
      userId: params.actorUserId,
      projectId: logFile.projectId,
      allowed: ['Admin', 'Dev', 'QA', 'Support'],
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.incidentLogLink.deleteMany({
        where: { logEvent: { logFileId: logFile.id } },
      });
      await tx.logEventStats.deleteMany({ where: { logFileId: logFile.id } });
      await tx.logEvent.deleteMany({ where: { logFileId: logFile.id } });
      await tx.logFile.deleteMany({ where: { id: logFile.id } });
    });

    if (logFile.storageKey) {
      try {
        await this.storage.deleteObject(logFile.storageKey);
      } catch {
        // ignore
      }
    }

    await this.audit.record({
      projectId: logFile.projectId,
      actorUserId: params.actorUserId,
      action: 'logs.delete',
      targetType: 'LogFile',
      targetId: logFile.id,
      metadata: { fileName: logFile.fileName },
    });

    return { deleted: true };
  }

  async getLogFileDetail(params: { actorUserId: string; id: string }) {
    const logFile = await this.prisma.logFile.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        projectId: true,
        fileName: true,
        status: true,
        parserVersion: true,
        uploadedAt: true,
      },
    });

    if (!logFile) {
      throw new ApiException({
        code: 'LOG_FILE_NOT_FOUND',
        message: 'Log file not found',
        status: 404,
      });
    }

    await this.rbac.requireProjectRoles({
      userId: params.actorUserId,
      projectId: logFile.projectId,
      allowed: ['Admin', 'PM', 'Dev', 'QA', 'Release', 'Support', 'Viewer'],
    });

    const [eventCount, errorCount] = await Promise.all([
      this.prisma.logEvent.count({ where: { logFileId: logFile.id } }),
      this.prisma.logEvent.count({
        where: { logFileId: logFile.id, eventName: 'PARSER_ERROR' },
      }),
    ]);

    const range = await this.prisma.logEvent.aggregate({
      where: { logFileId: logFile.id },
      _min: { timestampMs: true },
      _max: { timestampMs: true },
    });

    const minTimestampMs =
      range._min.timestampMs !== null && range._min.timestampMs !== undefined
        ? Number(range._min.timestampMs)
        : null;
    const maxTimestampMs =
      range._max.timestampMs !== null && range._max.timestampMs !== undefined
        ? Number(range._max.timestampMs)
        : null;

    const [deviceSnGroups, deviceMacGroups, linkCodeGroups] = await Promise.all(
      [
        this.prisma.logEvent.groupBy({
          by: ['deviceSn'],
          where: { logFileId: logFile.id, deviceSn: { not: null } },
          _count: { _all: true },
        }),
        this.prisma.logEvent.groupBy({
          by: ['deviceMac'],
          where: { logFileId: logFile.id, deviceMac: { not: null } },
          _count: { _all: true },
        }),
        this.prisma.logEvent.groupBy({
          by: ['linkCode'],
          where: { logFileId: logFile.id, linkCode: { not: null } },
          _count: { _all: true },
        }),
      ],
    );

    const toTopList = (rows: Array<{ value: string; count: number }>) =>
      rows.sort((a, b) => b.count - a.count).slice(0, 5);

    const deviceSnAgg = deviceSnGroups
      .filter(
        (r) => typeof r.deviceSn === 'string' && r.deviceSn.trim().length > 0,
      )
      .map((r) => ({ value: r.deviceSn as string, count: r._count._all }));
    const deviceMacAgg = deviceMacGroups
      .filter(
        (r) => typeof r.deviceMac === 'string' && r.deviceMac.trim().length > 0,
      )
      .map((r) => ({ value: r.deviceMac as string, count: r._count._all }));
    const linkCodeAgg = linkCodeGroups
      .filter(
        (r) => typeof r.linkCode === 'string' && r.linkCode.trim().length > 0,
      )
      .map((r) => ({ value: r.linkCode as string, count: r._count._all }));

    const sumCounts = (rows: Array<{ count: number }>) =>
      rows.reduce((sum, r) => sum + r.count, 0);

    return {
      id: logFile.id,
      projectId: logFile.projectId,
      fileName: logFile.fileName,
      status: logFile.status,
      parserVersion: logFile.parserVersion,
      uploadedAt: logFile.uploadedAt,
      eventCount,
      errorCount,
      minTimestampMs,
      maxTimestampMs,
      tracking: {
        deviceSn: {
          eventCount: sumCounts(deviceSnAgg),
          distinctCount: deviceSnAgg.length,
          top: toTopList(deviceSnAgg),
        },
        deviceMac: {
          eventCount: sumCounts(deviceMacAgg),
          distinctCount: deviceMacAgg.length,
          top: toTopList(deviceMacAgg),
        },
        linkCode: {
          eventCount: sumCounts(linkCodeAgg),
          distinctCount: linkCodeAgg.length,
          top: toTopList(linkCodeAgg),
        },
      },
    };
  }

  async getLogFileAnalysis(params: { actorUserId: string; logFileId: string }) {
    const logFile = await this.prisma.logFile.findUnique({
      where: { id: params.logFileId },
      select: { id: true, projectId: true },
    });

    if (!logFile) {
      throw new ApiException({
        code: 'LOG_FILE_NOT_FOUND',
        message: 'Log file not found',
        status: 404,
      });
    }

    await this.rbac.requireProjectRoles({
      userId: params.actorUserId,
      projectId: logFile.projectId,
      allowed: ['Admin', 'PM', 'Dev', 'QA', 'Release', 'Support', 'Viewer'],
    });

    const analysis = await this.prisma.logFileAnalysis.findUnique({
      where: { logFileId: logFile.id },
      select: {
        id: true,
        logFileId: true,
        qualityScore: true,
        bleQuality: true,
        backendQuality: true,
        anomalies: true,
        knownIssueMatches: true,
        mainFlowAnalysis: true,
        eventCoverageAnalysis: true,
        totalEvents: true,
        errorEvents: true,
        warningEvents: true,
        sessionCount: true,
        deviceCount: true,
        status: true,
        errorMessage: true,
        analyzedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!analysis) {
      throw new ApiException({
        code: 'ANALYSIS_NOT_FOUND',
        message: 'Analysis not found for this log file',
        status: 404,
      });
    }

    return analysis;
  }

  async getBleQualityReport(params: { actorUserId: string; id: string }) {
    const logFile = await this.prisma.logFile.findUnique({
      where: { id: params.id },
      select: { id: true, projectId: true },
    });

    if (!logFile) {
      throw new ApiException({
        code: 'LOG_FILE_NOT_FOUND',
        message: 'Log file not found',
        status: 404,
      });
    }

    await this.rbac.requireProjectRoles({
      userId: params.actorUserId,
      projectId: logFile.projectId,
      allowed: ['Admin', 'PM', 'Dev', 'QA', 'Release', 'Support', 'Viewer'],
    });

    const [statsRows, parserErrorCount, lastParserError] = await Promise.all([
      this.prisma.logEventStats.findMany({
        where: { logFileId: logFile.id },
        select: { eventName: true, level: true, count: true },
      }),
      this.prisma.logEvent.count({
        where: { logFileId: logFile.id, eventName: 'PARSER_ERROR' },
      }),
      this.prisma.logEvent.findFirst({
        where: { logFileId: logFile.id, eventName: 'PARSER_ERROR' },
        orderBy: [{ timestampMs: 'desc' }, { id: 'desc' }],
        select: { msgJson: true },
      }),
    ]);

    const loganStats = this.extractLoganDecryptStatsFromMsgJson(
      lastParserError?.msgJson,
    );

    const report = buildBleQualityReport({
      stats: statsRows,
      parserErrorCount,
      logan: loganStats,
    });

    return { logFileId: logFile.id, ...report };
  }

  async getBackendQualityReport(params: { actorUserId: string; id: string }) {
    const logFile = await this.prisma.logFile.findUnique({
      where: { id: params.id },
      select: { id: true, projectId: true },
    });

    if (!logFile) {
      throw new ApiException({
        code: 'LOG_FILE_NOT_FOUND',
        message: 'Log file not found',
        status: 404,
      });
    }

    await this.rbac.requireProjectRoles({
      userId: params.actorUserId,
      projectId: logFile.projectId,
      allowed: ['Admin', 'PM', 'Dev', 'QA', 'Release', 'Support', 'Viewer'],
    });

    const [httpRows, mqttRows] = await Promise.all([
      this.prisma.logEvent.findMany({
        where: {
          logFileId: logFile.id,
          eventName: {
            in: [
              'network_request_start',
              'network_request_success',
              'network_request_failed',
            ],
          },
        },
        select: {
          timestampMs: true,
          eventName: true,
          requestId: true,
          msgJson: true,
        },
        orderBy: [{ timestampMs: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.logEvent.findMany({
        where: {
          logFileId: logFile.id,
          stage: 'mqtt',
        },
        select: {
          timestampMs: true,
          eventName: true,
          deviceSn: true,
          requestId: true,
          errorCode: true,
          msgJson: true,
        },
        orderBy: [{ timestampMs: 'asc' }, { id: 'asc' }],
      }),
    ]);

    const report = buildBackendQualityReport({
      httpEvents: httpRows.map((e) => ({
        timestampMs: Number(e.timestampMs),
        eventName: e.eventName,
        requestId: e.requestId,
        msgJson: e.msgJson,
      })),
      mqttEvents: mqttRows.map((e) => ({
        timestampMs: Number(e.timestampMs),
        eventName: e.eventName,
        deviceSn: e.deviceSn,
        requestId: e.requestId,
        errorCode: e.errorCode,
        msgJson: e.msgJson,
      })),
    });

    return { logFileId: logFile.id, ...report };
  }

  async getDataContinuityReport(params: { actorUserId: string; id: string }) {
    const logFile = await this.prisma.logFile.findUnique({
      where: { id: params.id },
      select: { id: true, projectId: true },
    });

    if (!logFile) {
      throw new ApiException({
        code: 'LOG_FILE_NOT_FOUND',
        message: 'Log file not found',
        status: 404,
      });
    }

    await this.rbac.requireProjectRoles({
      userId: params.actorUserId,
      projectId: logFile.projectId,
      allowed: ['Admin', 'PM', 'Dev', 'QA', 'Release', 'Support', 'Viewer'],
    });

    const rows = await this.prisma.logEvent.findMany({
      where: {
        logFileId: logFile.id,
        errorCode: {
          in: [
            'DATA_STREAM_ORDER_BROKEN',
            'DATA_STREAM_OUT_OF_ORDER_BUFFERED',
            'DATA_STREAM_DUPLICATE_DROPPED',
            'DATA_PERSIST_TIMEOUT',
            'V3_RT_BUFFER_DROP',
          ],
        },
      },
      select: {
        timestampMs: true,
        deviceSn: true,
        linkCode: true,
        requestId: true,
        errorCode: true,
      },
      orderBy: [{ timestampMs: 'asc' }, { id: 'asc' }],
    });

    const report = buildDataContinuityReport({
      events: rows.map((e) => ({
        timestampMs: Number(e.timestampMs),
        deviceSn: e.deviceSn,
        linkCode: e.linkCode,
        requestId: e.requestId,
        errorCode: e.errorCode,
      })),
    });

    return { logFileId: logFile.id, ...report };
  }

  async getReasonCodeSummary(params: { actorUserId: string; id: string }) {
    const logFile = await this.prisma.logFile.findUnique({
      where: { id: params.id },
      select: { id: true, projectId: true },
    });

    if (!logFile) {
      throw new ApiException({
        code: 'LOG_FILE_NOT_FOUND',
        message: 'Log file not found',
        status: 404,
      });
    }

    await this.rbac.requireProjectRoles({
      userId: params.actorUserId,
      projectId: logFile.projectId,
      allowed: ['Admin', 'PM', 'Dev', 'QA', 'Release', 'Support', 'Viewer'],
    });

    const reasonCodeWhere: Prisma.LogEventWhereInput = {
      logFileId: logFile.id,
      reasonCode: { not: null, notIn: [''] },
    };

    const [totalEvents, rawReasonCodeGroups] = await Promise.all([
      this.prisma.logEvent.count({ where: { logFileId: logFile.id } }),
      this.prisma.logEvent.groupBy({
        by: ['reasonCode'],
        where: reasonCodeWhere,
        _count: { _all: true },
      }),
    ]);

    const reasonCountMap = new Map<string, number>();
    for (const row of rawReasonCodeGroups) {
      const reasonCode = this.normalizeOptionalValue(row.reasonCode);
      if (!reasonCode) continue;
      const count = this.normalizeCount(row._count._all);
      reasonCountMap.set(
        reasonCode,
        (reasonCountMap.get(reasonCode) ?? 0) + count,
      );
    }

    const reasonEntries = Array.from(reasonCountMap.entries())
      .map(([reasonCode, count]) => ({
        reasonCode,
        count,
        category: this.classifyReasonCode(reasonCode),
      }))
      .sort(
        (a, b) => b.count - a.count || a.reasonCode.localeCompare(b.reasonCode),
      );

    const reasonCodeEvents = reasonEntries.reduce(
      (sum, item) => sum + item.count,
      0,
    );
    const missingReasonCodeEvents = Math.max(totalEvents - reasonCodeEvents, 0);
    const coverageRatio = this.toPercent(reasonCodeEvents, totalEvents);

    if (reasonCodeEvents === 0) {
      return {
        logFileId: logFile.id,
        totalEvents,
        reasonCodeEvents,
        missingReasonCodeEvents,
        coverageRatio,
        uniqueReasonCodeCount: 0,
        topReasonCodes: [],
        byCategory: [],
        topStageOpResults: [],
      };
    }

    const categoryMap = new Map<
      string,
      { count: number; reasonCounts: Map<string, number> }
    >();
    for (const item of reasonEntries) {
      const existing = categoryMap.get(item.category);
      if (existing) {
        existing.count += item.count;
        existing.reasonCounts.set(item.reasonCode, item.count);
        continue;
      }
      categoryMap.set(item.category, {
        count: item.count,
        reasonCounts: new Map([[item.reasonCode, item.count]]),
      });
    }

    const byCategory = Array.from(categoryMap.entries())
      .map(([category, aggregate]) => ({
        category,
        count: aggregate.count,
        ratio: this.toPercent(aggregate.count, reasonCodeEvents),
        reasonCodeCount: aggregate.reasonCounts.size,
        topReasonCodes: Array.from(aggregate.reasonCounts.entries())
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .slice(0, 5)
          .map(([reasonCode, count]) => ({
            reasonCode,
            count,
            ratio: this.toPercent(count, reasonCodeEvents),
          })),
      }))
      .sort(
        (a, b) => b.count - a.count || a.category.localeCompare(b.category),
      );

    const rawStageOpResultReasonGroups = await this.prisma.logEvent.groupBy({
      by: ['stage', 'op', 'result', 'reasonCode'],
      where: reasonCodeWhere,
      _count: { _all: true },
    });

    type StageOpResultAggregate = {
      stage: string | null;
      op: string | null;
      result: string | null;
      count: number;
      reasonCounts: Map<string, number>;
    };

    const stageOpResultMap = new Map<string, StageOpResultAggregate>();
    for (const row of rawStageOpResultReasonGroups) {
      const reasonCode = this.normalizeOptionalValue(row.reasonCode);
      if (!reasonCode) continue;
      const stage = this.normalizeOptionalValue(row.stage);
      const op = this.normalizeOptionalValue(row.op);
      const result = this.normalizeOptionalValue(row.result);
      const key = `${stage ?? ''}\u0001${op ?? ''}\u0001${result ?? ''}`;
      const count = this.normalizeCount(row._count._all);

      const existing = stageOpResultMap.get(key);
      if (existing) {
        existing.count += count;
        existing.reasonCounts.set(
          reasonCode,
          (existing.reasonCounts.get(reasonCode) ?? 0) + count,
        );
        continue;
      }

      stageOpResultMap.set(key, {
        stage,
        op,
        result,
        count,
        reasonCounts: new Map([[reasonCode, count]]),
      });
    }

    const topStageOpResults = Array.from(stageOpResultMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map((item) => ({
        stage: item.stage,
        op: item.op,
        result: item.result,
        count: item.count,
        ratio: this.toPercent(item.count, reasonCodeEvents),
        topReasonCodes: Array.from(item.reasonCounts.entries())
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .slice(0, 3)
          .map(([reasonCode, count]) => ({
            reasonCode,
            count,
            ratioWithinCombination: this.toPercent(count, item.count),
          })),
      }));

    return {
      logFileId: logFile.id,
      totalEvents,
      reasonCodeEvents,
      missingReasonCodeEvents,
      coverageRatio,
      uniqueReasonCodeCount: reasonEntries.length,
      topReasonCodes: reasonEntries.slice(0, 15).map((item) => ({
        reasonCode: item.reasonCode,
        category: item.category,
        count: item.count,
        ratio: this.toPercent(item.count, reasonCodeEvents),
      })),
      byCategory,
      topStageOpResults,
    };
  }

  async getStreamSessionQualityReport(params: {
    actorUserId: string;
    id: string;
  }) {
    const logFile = await this.prisma.logFile.findUnique({
      where: { id: params.id },
      select: { id: true, projectId: true },
    });

    if (!logFile) {
      throw new ApiException({
        code: 'LOG_FILE_NOT_FOUND',
        message: 'Log file not found',
        status: 404,
      });
    }

    await this.rbac.requireProjectRoles({
      userId: params.actorUserId,
      projectId: logFile.projectId,
      allowed: ['Admin', 'PM', 'Dev', 'QA', 'Release', 'Support', 'Viewer'],
    });

    const rows = await this.prisma.logEvent.findMany({
      where: {
        logFileId: logFile.id,
        errorCode: 'DATA_STREAM_SESSION_SUMMARY',
      },
      select: {
        timestampMs: true,
        deviceSn: true,
        linkCode: true,
        requestId: true,
        msgJson: true,
      },
      orderBy: [{ timestampMs: 'asc' }, { id: 'asc' }],
    });

    const report = buildStreamSessionQualityReport({
      events: rows.map((e) => ({
        timestampMs: Number(e.timestampMs),
        deviceSn: e.deviceSn,
        linkCode: e.linkCode,
        requestId: e.requestId,
        msgJson: e.msgJson,
      })),
    });

    return { logFileId: logFile.id, ...report };
  }
}
