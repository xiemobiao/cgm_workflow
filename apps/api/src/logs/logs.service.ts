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

  async searchEvents(params: {
    actorUserId: string;
    projectId: string;
    startTime: string;
    endTime: string;
    eventName?: string;
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

    const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);

    const andFilters: Prisma.LogEventWhereInput[] = [
      { projectId: params.projectId },
      { timestampMs: { gte: startMs, lte: endMs } },
    ];

    if (params.eventName) andFilters.push({ eventName: params.eventName });
    if (params.appId) andFilters.push({ appId: params.appId });
    if (params.sdkVersion) andFilters.push({ sdkVersion: params.sdkVersion });
    if (params.level) andFilters.push({ level: params.level });

    if (params.cursor) {
      const cursor = this.decodeCursor(params.cursor);
      andFilters.push({
        OR: [
          { timestampMs: { lt: cursor.timestampMs } },
          {
            AND: [
              { timestampMs: cursor.timestampMs },
              { id: { lt: cursor.id } },
            ],
          },
        ],
      });
    }

    const rows = await this.prisma.logEvent.findMany({
      where: { AND: andFilters },
      orderBy: [{ timestampMs: 'desc' }, { id: 'desc' }],
      take: limit + 1,
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
      })),
      nextCursor,
    };
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
      msgJson: event.msgJson,
      rawLine: event.rawLine,
      createdAt: event.createdAt,
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

    return {
      id: logFile.id,
      fileName: logFile.fileName,
      status: logFile.status,
      parserVersion: logFile.parserVersion,
      uploadedAt: logFile.uploadedAt,
      eventCount,
      errorCount,
    };
  }
}
