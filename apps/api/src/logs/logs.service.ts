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
        return this.truncateText(String(value), 240);
      }
    }
    return this.truncateText(String(value), 240);
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

    const andFilters: Prisma.LogFileWhereInput[] = [{ projectId: params.projectId }];
    if (params.cursor) {
      const cursor = this.decodeFileCursor(params.cursor);
      andFilters.push({
        OR: [
          { uploadedAt: { lt: cursor.uploadedAt } },
          {
            AND: [
              { uploadedAt: cursor.uploadedAt },
              { id: { lt: cursor.id } },
            ],
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
      msgJson: unknown | null;
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
}
