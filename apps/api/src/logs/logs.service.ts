import { Injectable } from '@nestjs/common';
import { LogFileStatus, Prisma } from '@prisma/client';
import { ApiException } from '../common/api-exception';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import { StorageService } from '../storage/storage.service';
import { LogsParserService } from './logs.parser.service';

@Injectable()
export class LogsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    private readonly parser: LogsParserService,
  ) {}

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
      setImmediate(() => this.parser.enqueue(logFile.id));
    } catch {
      // ignore
    }

    return { logFileId: logFile.id, status: logFile.status };
  }

  private decodeCursor(cursor: string): { id: string; timestampMs: bigint } {
    try {
      const json = Buffer.from(cursor, 'base64').toString('utf8');
      const parsed = JSON.parse(json) as unknown;
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('cursor is not an object');
      }
      const obj = parsed as { id?: unknown; timestampMs?: unknown };
      if (typeof obj.id !== 'string') throw new Error('cursor.id invalid');
      const ts =
        typeof obj.timestampMs === 'string'
          ? BigInt(obj.timestampMs)
          : typeof obj.timestampMs === 'number'
            ? BigInt(Math.trunc(obj.timestampMs))
            : null;
      if (!ts) throw new Error('cursor.timestampMs invalid');
      return { id: obj.id, timestampMs: ts };
    } catch {
      throw new ApiException({
        code: 'INVALID_CURSOR',
        message: 'Invalid cursor',
        status: 400,
      });
    }
  }

  private encodeCursor(item: { id: string; timestampMs: bigint }) {
    const payload = JSON.stringify({
      id: item.id,
      timestampMs: item.timestampMs.toString(),
    });
    return Buffer.from(payload, 'utf8').toString('base64');
  }

  private decodeFileCursor(cursor: string): { id: string; uploadedAt: Date } {
    try {
      const json = Buffer.from(cursor, 'base64').toString('utf8');
      const parsed = JSON.parse(json) as unknown;
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('cursor is not an object');
      }
      const obj = parsed as { id?: unknown; uploadedAtMs?: unknown };
      if (typeof obj.id !== 'string') throw new Error('cursor.id invalid');
      const uploadedAtMs =
        typeof obj.uploadedAtMs === 'number'
          ? obj.uploadedAtMs
          : typeof obj.uploadedAtMs === 'string'
            ? Number(obj.uploadedAtMs)
            : NaN;
      if (!Number.isFinite(uploadedAtMs)) {
        throw new Error('cursor.uploadedAtMs invalid');
      }
      return { id: obj.id, uploadedAt: new Date(uploadedAtMs) };
    } catch {
      throw new ApiException({
        code: 'INVALID_CURSOR',
        message: 'Invalid cursor',
        status: 400,
      });
    }
  }

  private encodeFileCursor(item: { id: string; uploadedAt: Date }) {
    const payload = JSON.stringify({
      id: item.id,
      uploadedAtMs: item.uploadedAt.getTime(),
    });
    return Buffer.from(payload, 'utf8').toString('base64');
  }

  private truncateText(value: string, maxLen: number) {
    const normalized = value.replace(/\s+/g, ' ').trim();
    if (normalized.length <= maxLen) return normalized;
    return `${normalized.slice(0, Math.max(0, maxLen - 1))}…`;
  }

  private msgPreviewFromJson(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string') return this.truncateText(value, 240);
    if (typeof value === 'number' || typeof value === 'boolean') {
      return this.truncateText(String(value), 240);
    }
    if (Array.isArray(value)) {
      try {
        return this.truncateText(JSON.stringify(value), 240);
      } catch {
        return this.truncateText(String(value), 240);
      }
    }
    if (typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      const knownKeys = ['message', 'msg', 'error', 'err', 'reason', 'detail'];
      for (const key of knownKeys) {
        const v = obj[key];
        if (typeof v === 'string' && v.trim()) {
          return this.truncateText(v, 240);
        }
      }
      try {
        return this.truncateText(JSON.stringify(obj), 240);
      } catch {
        return this.truncateText(
          Object.prototype.toString.call(value) as string,
          240,
        );
      }
    }
    if (typeof value === 'bigint') {
      return this.truncateText(value.toString(), 240);
    }
    if (typeof value === 'symbol') {
      return this.truncateText(value.toString(), 240);
    }
    if (typeof value === 'function') {
      const name = value.name ? ` ${value.name}` : '';
      return this.truncateText(`[function${name}]`, 240);
    }
    return this.truncateText(
      Object.prototype.toString.call(value) as string,
      240,
    );
  }

  async searchEvents(params: {
    actorUserId: string;
    projectId: string;
    startTime: string;
    endTime: string;
    eventName?: string;
    logFileId?: string;
    q?: string;
    direction?: 'asc' | 'desc';
    appId?: string;
    sdkVersion?: string;
    level?: number;
    levelGte?: number;
    levelLte?: number;
    // Tracking field filters
    linkCode?: string;
    requestId?: string;
    deviceMac?: string;
    errorCode?: string;
    // Content search
    msgContains?: string;
    limit?: number;
    cursor?: string;
  }) {
    await this.rbac.requireProjectRoles({
      userId: params.actorUserId,
      projectId: params.projectId,
      allowed: ['Admin', 'PM', 'Dev', 'QA', 'Release', 'Support', 'Viewer'],
    });

    const startMs = BigInt(new Date(params.startTime).getTime());
    const endMs = BigInt(new Date(params.endTime).getTime());
    if (endMs < startMs) {
      throw new ApiException({
        code: 'INVALID_TIME_RANGE',
        message: 'endTime must be >= startTime',
        status: 400,
      });
    }

    const limit = Math.min(Math.max(params.limit ?? 50, 1), 1000);

    const andFilters: Prisma.LogEventWhereInput[] = [
      { projectId: params.projectId },
      { timestampMs: { gte: startMs, lte: endMs } },
    ];

    if (params.eventName) andFilters.push({ eventName: params.eventName });
    if (params.logFileId) andFilters.push({ logFileId: params.logFileId });
    if (params.appId) andFilters.push({ appId: params.appId });
    if (params.sdkVersion) andFilters.push({ sdkVersion: params.sdkVersion });
    if (params.level) andFilters.push({ level: params.level });

    // Level range filters
    if (params.levelGte !== undefined) andFilters.push({ level: { gte: params.levelGte } });
    if (params.levelLte !== undefined) andFilters.push({ level: { lte: params.levelLte } });

    // Tracking field filters
    if (params.linkCode) andFilters.push({ linkCode: params.linkCode });
    if (params.requestId) andFilters.push({ requestId: params.requestId });
    if (params.deviceMac) andFilters.push({ deviceMac: params.deviceMac });
    if (params.errorCode) andFilters.push({ errorCode: params.errorCode });

    // msgJson content search (case-insensitive full-text search in JSON)
    if (params.msgContains?.trim()) {
      andFilters.push({
        msgJson: {
          string_contains: params.msgContains.trim(),
        },
      });
    }

    const q = params.q?.trim();
    if (q) {
      andFilters.push({
        OR: [
          { eventName: { contains: q, mode: 'insensitive' } },
          { rawLine: { contains: q, mode: 'insensitive' } },
          { terminalInfo: { contains: q, mode: 'insensitive' } },
          { threadName: { contains: q, mode: 'insensitive' } },
          { appId: { contains: q, mode: 'insensitive' } },
          { sdkVersion: { contains: q, mode: 'insensitive' } },
        ],
      });
    }

    const direction = params.direction === 'asc' ? 'asc' : 'desc';

    if (params.cursor) {
      const cursor = this.decodeCursor(params.cursor);
      andFilters.push({
        OR: [
          direction === 'desc'
            ? { timestampMs: { lt: cursor.timestampMs } }
            : { timestampMs: { gt: cursor.timestampMs } },
          direction === 'desc'
            ? {
                AND: [
                  { timestampMs: cursor.timestampMs },
                  { id: { lt: cursor.id } },
                ],
              }
            : {
                AND: [
                  { timestampMs: cursor.timestampMs },
                  { id: { gt: cursor.id } },
                ],
              },
        ],
      });
    }

    const rows = await this.prisma.logEvent.findMany({
      where: { AND: andFilters },
      orderBy: [{ timestampMs: direction }, { id: direction }],
      take: limit + 1,
      select: {
        id: true,
        eventName: true,
        level: true,
        timestampMs: true,
        sdkVersion: true,
        appId: true,
        logFileId: true,
        msgJson: true,
      },
    });

    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    const nextCursor =
      hasMore && page.length > 0
        ? this.encodeCursor({
            id: page[page.length - 1].id,
            timestampMs: page[page.length - 1].timestampMs,
          })
        : null;

    return {
      items: page.map((e) => ({
        id: e.id,
        eventName: e.eventName,
        level: e.level,
        timestampMs: Number(e.timestampMs),
        sdkVersion: e.sdkVersion,
        appId: e.appId,
        logFileId: e.logFileId,
        msg: this.msgPreviewFromJson(e.msgJson),
      })),
      nextCursor,
    };
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
      const cursor = this.decodeFileCursor(params.cursor);
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
      },
    });

    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    const nextCursor =
      hasMore && page.length > 0
        ? this.encodeFileCursor({
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
      await tx.logEvent.deleteMany({ where: { logFileId: logFile.id } });
      await tx.logFile.delete({ where: { id: logFile.id } });
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

  async getEventDetail(params: { actorUserId: string; id: string }) {
    const event = await this.prisma.logEvent.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        projectId: true,
        logFileId: true,
        timestampMs: true,
        level: true,
        eventName: true,
        sdkVersion: true,
        appId: true,
        terminalInfo: true,
        threadName: true,
        threadId: true,
        isMainThread: true,
        msgJson: true,
        rawLine: true,
        createdAt: true,
      },
    });

    if (!event) {
      throw new ApiException({
        code: 'LOG_EVENT_NOT_FOUND',
        message: 'Log event not found',
        status: 404,
      });
    }

    await this.rbac.requireProjectRoles({
      userId: params.actorUserId,
      projectId: event.projectId,
      allowed: ['Admin', 'PM', 'Dev', 'QA', 'Release', 'Support', 'Viewer'],
    });

    return {
      id: event.id,
      logFileId: event.logFileId,
      timestampMs: Number(event.timestampMs),
      level: event.level,
      eventName: event.eventName,
      sdkVersion: event.sdkVersion,
      appId: event.appId,
      terminalInfo: event.terminalInfo,
      threadName: event.threadName,
      threadId: event.threadId ? Number(event.threadId) : null,
      isMainThread: event.isMainThread,
      msg: this.msgPreviewFromJson(event.msgJson),
      msgJson: event.msgJson,
      rawLine: event.rawLine,
      createdAt: event.createdAt,
    };
  }

  async getEventContext(params: {
    actorUserId: string;
    id: string;
    before?: number;
    after?: number;
  }) {
    const before = Math.min(Math.max(params.before ?? 10, 0), 50);
    const after = Math.min(Math.max(params.after ?? 10, 0), 50);

    const target = await this.prisma.logEvent.findUnique({
      where: { id: params.id },
      select: { id: true, projectId: true, logFileId: true, timestampMs: true },
    });

    if (!target) {
      throw new ApiException({
        code: 'LOG_EVENT_NOT_FOUND',
        message: 'Log event not found',
        status: 404,
      });
    }

    await this.rbac.requireProjectRoles({
      userId: params.actorUserId,
      projectId: target.projectId,
      allowed: ['Admin', 'PM', 'Dev', 'QA', 'Release', 'Support', 'Viewer'],
    });

    const select = {
      id: true,
      logFileId: true,
      timestampMs: true,
      level: true,
      eventName: true,
      sdkVersion: true,
      appId: true,
      msgJson: true,
    } as const;

    const [beforeRows, afterRows] = await Promise.all([
      before > 0
        ? this.prisma.logEvent.findMany({
            where: {
              logFileId: target.logFileId,
              OR: [
                { timestampMs: { lt: target.timestampMs } },
                {
                  AND: [
                    { timestampMs: target.timestampMs },
                    { id: { lt: target.id } },
                  ],
                },
              ],
            },
            orderBy: [{ timestampMs: 'desc' }, { id: 'desc' }],
            take: before,
            select,
          })
        : Promise.resolve([]),
      after > 0
        ? this.prisma.logEvent.findMany({
            where: {
              logFileId: target.logFileId,
              OR: [
                { timestampMs: { gt: target.timestampMs } },
                {
                  AND: [
                    { timestampMs: target.timestampMs },
                    { id: { gt: target.id } },
                  ],
                },
              ],
            },
            orderBy: [{ timestampMs: 'asc' }, { id: 'asc' }],
            take: after,
            select,
          })
        : Promise.resolve([]),
    ]);

    const normalize = (e: {
      id: string;
      logFileId: string;
      timestampMs: bigint;
      level: number;
      eventName: string;
      sdkVersion: string | null;
      appId: string | null;
      msgJson: unknown;
    }) => ({
      id: e.id,
      logFileId: e.logFileId,
      timestampMs: Number(e.timestampMs),
      level: e.level,
      eventName: e.eventName,
      sdkVersion: e.sdkVersion,
      appId: e.appId,
      msg: this.msgPreviewFromJson(e.msgJson),
    });

    return {
      logFileId: target.logFileId,
      before: beforeRows.slice().reverse().map(normalize),
      after: afterRows.map(normalize),
    };
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
    };
  }

  // ========== Tracing Methods ==========

  async traceByLinkCode(params: {
    actorUserId: string;
    projectId: string;
    linkCode: string;
    limit?: number;
  }) {
    await this.rbac.requireProjectRoles({
      userId: params.actorUserId,
      projectId: params.projectId,
      allowed: ['Admin', 'PM', 'Dev', 'QA', 'Release', 'Support', 'Viewer'],
    });

    const limit = Math.min(Math.max(params.limit ?? 500, 1), 2000);

    const events = await this.prisma.logEvent.findMany({
      where: {
        projectId: params.projectId,
        linkCode: params.linkCode,
      },
      orderBy: [{ timestampMs: 'asc' }, { id: 'asc' }],
      take: limit,
      select: {
        id: true,
        eventName: true,
        level: true,
        timestampMs: true,
        sdkVersion: true,
        appId: true,
        logFileId: true,
        msgJson: true,
        threadName: true,
        deviceMac: true,
        requestId: true,
        errorCode: true,
      },
    });

    return {
      linkCode: params.linkCode,
      count: events.length,
      items: events.map((e) => ({
        id: e.id,
        eventName: e.eventName,
        level: e.level,
        timestampMs: Number(e.timestampMs),
        sdkVersion: e.sdkVersion,
        appId: e.appId,
        logFileId: e.logFileId,
        threadName: e.threadName,
        deviceMac: e.deviceMac,
        requestId: e.requestId,
        errorCode: e.errorCode,
        msg: this.msgPreviewFromJson(e.msgJson),
      })),
    };
  }

  async traceByRequestId(params: {
    actorUserId: string;
    projectId: string;
    requestId: string;
  }) {
    await this.rbac.requireProjectRoles({
      userId: params.actorUserId,
      projectId: params.projectId,
      allowed: ['Admin', 'PM', 'Dev', 'QA', 'Release', 'Support', 'Viewer'],
    });

    const events = await this.prisma.logEvent.findMany({
      where: {
        projectId: params.projectId,
        requestId: params.requestId,
      },
      orderBy: [{ timestampMs: 'asc' }, { id: 'asc' }],
      take: 100,
      select: {
        id: true,
        eventName: true,
        level: true,
        timestampMs: true,
        sdkVersion: true,
        logFileId: true,
        msgJson: true,
        threadName: true,
        deviceMac: true,
        errorCode: true,
      },
    });

    return {
      requestId: params.requestId,
      count: events.length,
      items: events.map((e) => ({
        id: e.id,
        eventName: e.eventName,
        level: e.level,
        timestampMs: Number(e.timestampMs),
        sdkVersion: e.sdkVersion,
        logFileId: e.logFileId,
        threadName: e.threadName,
        deviceMac: e.deviceMac,
        errorCode: e.errorCode,
        msg: this.msgPreviewFromJson(e.msgJson),
      })),
    };
  }

  async traceByDeviceMac(params: {
    actorUserId: string;
    projectId: string;
    deviceMac: string;
    startTime: string;
    endTime: string;
    limit?: number;
  }) {
    await this.rbac.requireProjectRoles({
      userId: params.actorUserId,
      projectId: params.projectId,
      allowed: ['Admin', 'PM', 'Dev', 'QA', 'Release', 'Support', 'Viewer'],
    });

    const startMs = BigInt(new Date(params.startTime).getTime());
    const endMs = BigInt(new Date(params.endTime).getTime());
    const limit = Math.min(Math.max(params.limit ?? 500, 1), 2000);

    const events = await this.prisma.logEvent.findMany({
      where: {
        projectId: params.projectId,
        deviceMac: params.deviceMac,
        timestampMs: { gte: startMs, lte: endMs },
      },
      orderBy: [{ timestampMs: 'asc' }, { id: 'asc' }],
      take: limit,
      select: {
        id: true,
        eventName: true,
        level: true,
        timestampMs: true,
        sdkVersion: true,
        logFileId: true,
        msgJson: true,
        threadName: true,
        linkCode: true,
        requestId: true,
        errorCode: true,
      },
    });

    return {
      deviceMac: params.deviceMac,
      count: events.length,
      items: events.map((e) => ({
        id: e.id,
        eventName: e.eventName,
        level: e.level,
        timestampMs: Number(e.timestampMs),
        sdkVersion: e.sdkVersion,
        logFileId: e.logFileId,
        threadName: e.threadName,
        linkCode: e.linkCode,
        requestId: e.requestId,
        errorCode: e.errorCode,
        msg: this.msgPreviewFromJson(e.msgJson),
      })),
    };
  }

  // ========== Statistics Methods ==========

  async getEventStats(params: {
    actorUserId: string;
    projectId: string;
    logFileId?: string;
    startTime?: string;
    endTime?: string;
  }) {
    await this.rbac.requireProjectRoles({
      userId: params.actorUserId,
      projectId: params.projectId,
      allowed: ['Admin', 'PM', 'Dev', 'QA', 'Release', 'Support', 'Viewer'],
    });

    const whereClause: Prisma.LogEventStatsWhereInput = {
      projectId: params.projectId,
    };

    if (params.logFileId) {
      whereClause.logFileId = params.logFileId;
    }

    // Get aggregated stats from LogEventStats table
    const stats = await this.prisma.logEventStats.findMany({
      where: whereClause,
      select: {
        eventName: true,
        level: true,
        count: true,
      },
    });

    // Aggregate by event name
    const byEventName = new Map<string, number>();
    const byLevel = new Map<number, number>();
    let totalEvents = 0;

    for (const stat of stats) {
      totalEvents += stat.count;

      const eventCount = byEventName.get(stat.eventName) ?? 0;
      byEventName.set(stat.eventName, eventCount + stat.count);

      const levelCount = byLevel.get(stat.level) ?? 0;
      byLevel.set(stat.level, levelCount + stat.count);
    }

    // Calculate error rate (level 4 = ERROR)
    const errorCount = byLevel.get(4) ?? 0;
    const errorRate = totalEvents > 0 ? errorCount / totalEvents : 0;

    return {
      totalEvents,
      byEventName: Array.from(byEventName.entries())
        .map(([eventName, count]) => ({ eventName, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 50),
      byLevel: Array.from(byLevel.entries())
        .map(([level, count]) => ({ level, count }))
        .sort((a, b) => a.level - b.level),
      errorRate: Math.round(errorRate * 10000) / 100, // percentage with 2 decimals
    };
  }

  async getErrorHotspots(params: {
    actorUserId: string;
    projectId: string;
    startTime: string;
    endTime: string;
    limit?: number;
  }) {
    await this.rbac.requireProjectRoles({
      userId: params.actorUserId,
      projectId: params.projectId,
      allowed: ['Admin', 'PM', 'Dev', 'QA', 'Release', 'Support', 'Viewer'],
    });

    const startMs = BigInt(new Date(params.startTime).getTime());
    const endMs = BigInt(new Date(params.endTime).getTime());
    const limit = Math.min(Math.max(params.limit ?? 20, 1), 100);

    // Get error events grouped by eventName and errorCode
    const errorEvents = await this.prisma.logEvent.groupBy({
      by: ['eventName', 'errorCode'],
      where: {
        projectId: params.projectId,
        timestampMs: { gte: startMs, lte: endMs },
        level: { gte: 3 }, // WARN and ERROR
      },
      _count: { _all: true },
      _max: { timestampMs: true },
      orderBy: { _count: { _all: 'desc' } },
      take: limit,
    });

    return {
      items: errorEvents.map((e) => ({
        eventName: e.eventName,
        errorCode: e.errorCode,
        count: e._count._all,
        lastSeenMs: e._max.timestampMs ? Number(e._max.timestampMs) : null,
      })),
    };
  }

  async getTimeline(params: {
    actorUserId: string;
    projectId: string;
    logFileId?: string;
    linkCode?: string;
    deviceMac?: string;
    startTime?: string;
    endTime?: string;
    limit?: number;
  }) {
    await this.rbac.requireProjectRoles({
      userId: params.actorUserId,
      projectId: params.projectId,
      allowed: ['Admin', 'PM', 'Dev', 'QA', 'Release', 'Support', 'Viewer'],
    });

    const limit = Math.min(Math.max(params.limit ?? 200, 1), 1000);

    const whereClause: Prisma.LogEventWhereInput = {
      projectId: params.projectId,
    };

    if (params.logFileId) whereClause.logFileId = params.logFileId;
    if (params.linkCode) whereClause.linkCode = params.linkCode;
    if (params.deviceMac) whereClause.deviceMac = params.deviceMac;

    if (params.startTime || params.endTime) {
      whereClause.timestampMs = {};
      if (params.startTime) {
        whereClause.timestampMs.gte = BigInt(new Date(params.startTime).getTime());
      }
      if (params.endTime) {
        whereClause.timestampMs.lte = BigInt(new Date(params.endTime).getTime());
      }
    }

    const events = await this.prisma.logEvent.findMany({
      where: whereClause,
      orderBy: [{ timestampMs: 'asc' }, { id: 'asc' }],
      take: limit,
      select: {
        id: true,
        eventName: true,
        level: true,
        timestampMs: true,
        threadName: true,
        deviceMac: true,
        linkCode: true,
        requestId: true,
        errorCode: true,
        msgJson: true,
      },
    });

    return {
      count: events.length,
      items: events.map((e) => ({
        id: e.id,
        eventName: e.eventName,
        level: e.level,
        timestampMs: Number(e.timestampMs),
        threadName: e.threadName,
        deviceMac: e.deviceMac,
        linkCode: e.linkCode,
        requestId: e.requestId,
        errorCode: e.errorCode,
        msg: this.msgPreviewFromJson(e.msgJson),
      })),
    };
  }

  // ========== Command Chain Analysis ==========

  async getCommandChains(params: {
    actorUserId: string;
    projectId: string;
    deviceMac?: string;
    startTime: string;
    endTime: string;
    limit?: number;
  }) {
    await this.rbac.requireProjectRoles({
      userId: params.actorUserId,
      projectId: params.projectId,
      allowed: ['Admin', 'PM', 'Dev', 'QA', 'Release', 'Support', 'Viewer'],
    });

    const startMs = BigInt(new Date(params.startTime).getTime());
    const endMs = BigInt(new Date(params.endTime).getTime());
    const limit = Math.min(Math.max(params.limit ?? 100, 1), 500);

    // Query all events with requestId
    const whereClause: Prisma.LogEventWhereInput = {
      projectId: params.projectId,
      requestId: { not: null },
      timestampMs: { gte: startMs, lte: endMs },
    };

    if (params.deviceMac) {
      whereClause.deviceMac = params.deviceMac;
    }

    const events = await this.prisma.logEvent.findMany({
      where: whereClause,
      orderBy: [{ timestampMs: 'asc' }],
      select: {
        id: true,
        eventName: true,
        level: true,
        timestampMs: true,
        requestId: true,
        deviceMac: true,
        errorCode: true,
        msgJson: true,
      },
    });

    // Group by requestId
    const chainMap = new Map<
      string,
      {
        requestId: string;
        deviceMac: string | null;
        events: typeof events;
      }
    >();

    for (const event of events) {
      if (!event.requestId) continue;
      const existing = chainMap.get(event.requestId);
      if (existing) {
        existing.events.push(event);
        if (!existing.deviceMac && event.deviceMac) {
          existing.deviceMac = event.deviceMac;
        }
      } else {
        chainMap.set(event.requestId, {
          requestId: event.requestId,
          deviceMac: event.deviceMac,
          events: [event],
        });
      }
    }

    // Build command chains with status detection
    const chains = Array.from(chainMap.values())
      .slice(0, limit)
      .map((chain) => {
        const sortedEvents = chain.events.sort(
          (a, b) => Number(a.timestampMs) - Number(b.timestampMs),
        );

        const firstEvent = sortedEvents[0];
        const lastEvent = sortedEvents[sortedEvents.length - 1];
        const duration = Number(lastEvent.timestampMs) - Number(firstEvent.timestampMs);

        // Detect status based on event names and error codes
        let status: 'success' | 'timeout' | 'error' | 'pending' = 'pending';
        const hasError = sortedEvents.some((e) => e.level >= 4 || e.errorCode);
        const hasTimeout = sortedEvents.some(
          (e) =>
            e.eventName.toLowerCase().includes('timeout') ||
            e.errorCode?.toLowerCase().includes('timeout'),
        );
        const hasResponse = sortedEvents.some(
          (e) =>
            e.eventName.toLowerCase().includes('response') ||
            e.eventName.toLowerCase().includes('success') ||
            e.eventName.toLowerCase().includes('received'),
        );

        if (hasTimeout) {
          status = 'timeout';
        } else if (hasError) {
          status = 'error';
        } else if (hasResponse) {
          status = 'success';
        }

        return {
          requestId: chain.requestId,
          deviceMac: chain.deviceMac,
          eventCount: sortedEvents.length,
          startTime: Number(firstEvent.timestampMs),
          endTime: Number(lastEvent.timestampMs),
          duration,
          status,
          events: sortedEvents.map((e) => ({
            id: e.id,
            eventName: e.eventName,
            level: e.level,
            timestampMs: Number(e.timestampMs),
            errorCode: e.errorCode,
            msg: this.msgPreviewFromJson(e.msgJson),
          })),
        };
      });

    // Sort by start time descending (newest first)
    chains.sort((a, b) => b.startTime - a.startTime);

    return {
      count: chains.length,
      items: chains,
    };
  }

  // ========== Relation Discovery ==========

  async getLinkCodeDevices(params: {
    actorUserId: string;
    projectId: string;
    linkCode: string;
  }) {
    await this.rbac.requireProjectRoles({
      userId: params.actorUserId,
      projectId: params.projectId,
      allowed: ['Admin', 'PM', 'Dev', 'QA', 'Release', 'Support', 'Viewer'],
    });

    // Get all distinct deviceMac values for this linkCode
    const devices = await this.prisma.logEvent.groupBy({
      by: ['deviceMac'],
      where: {
        projectId: params.projectId,
        linkCode: params.linkCode,
        deviceMac: { not: null },
      },
      _count: { _all: true },
      _min: { timestampMs: true },
      _max: { timestampMs: true },
    });

    return {
      linkCode: params.linkCode,
      devices: devices.map((d) => ({
        deviceMac: d.deviceMac,
        eventCount: d._count._all,
        firstSeenMs: d._min.timestampMs ? Number(d._min.timestampMs) : null,
        lastSeenMs: d._max.timestampMs ? Number(d._max.timestampMs) : null,
      })),
    };
  }

  async getDeviceSessions(params: {
    actorUserId: string;
    projectId: string;
    deviceMac: string;
    startTime: string;
    endTime: string;
  }) {
    await this.rbac.requireProjectRoles({
      userId: params.actorUserId,
      projectId: params.projectId,
      allowed: ['Admin', 'PM', 'Dev', 'QA', 'Release', 'Support', 'Viewer'],
    });

    const startMs = BigInt(new Date(params.startTime).getTime());
    const endMs = BigInt(new Date(params.endTime).getTime());

    // Get all distinct linkCode values for this device
    const sessions = await this.prisma.logEvent.groupBy({
      by: ['linkCode'],
      where: {
        projectId: params.projectId,
        deviceMac: params.deviceMac,
        linkCode: { not: null },
        timestampMs: { gte: startMs, lte: endMs },
      },
      _count: { _all: true },
      _min: { timestampMs: true },
      _max: { timestampMs: true },
    });

    return {
      deviceMac: params.deviceMac,
      sessions: sessions.map((s) => ({
        linkCode: s.linkCode,
        eventCount: s._count._all,
        startTimeMs: s._min.timestampMs ? Number(s._min.timestampMs) : null,
        endTimeMs: s._max.timestampMs ? Number(s._max.timestampMs) : null,
      })),
    };
  }
}
