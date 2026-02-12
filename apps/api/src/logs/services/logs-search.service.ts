import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ApiException } from '../../common/api-exception';
import { PrismaService } from '../../database/prisma.service';
import { RbacService } from '../../rbac/rbac.service';
import { LogsHelperService } from './logs-helper.service';

/**
 * Service for log event search and detail operations.
 */
@Injectable()
export class LogsSearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
    private readonly helper: LogsHelperService,
  ) {}

  private normalizeOptionalText(value: unknown) {
    if (typeof value !== 'string') return null;
    return value;
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
    stage?: string;
    op?: string;
    result?: string;
    // Tracking field filters
    linkCode?: string;
    requestId?: string;
    attemptId?: string;
    deviceMac?: string;
    deviceSn?: string;
    errorCode?: string;
    reasonCode?: string;
    excludeNoisy?: boolean;
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

    if (params.logFileId) {
      await this.helper.assertLogFileInProject({
        projectId: params.projectId,
        logFileId: params.logFileId,
      });
    }

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
    if (params.levelGte !== undefined)
      andFilters.push({ level: { gte: params.levelGte } });
    if (params.levelLte !== undefined)
      andFilters.push({ level: { lte: params.levelLte } });

    const stage = params.stage?.trim().toLowerCase();
    if (stage) andFilters.push({ stage });
    const op = params.op?.trim().toLowerCase();
    if (op) andFilters.push({ op });
    const result = params.result?.trim().toLowerCase();
    if (result) andFilters.push({ result });

    // Tracking field filters
    if (params.linkCode) andFilters.push({ linkCode: params.linkCode });
    if (params.requestId) andFilters.push({ requestId: params.requestId });
    if (params.attemptId) andFilters.push({ attemptId: params.attemptId });
    if (params.deviceMac) andFilters.push({ deviceMac: params.deviceMac });
    if (params.deviceSn) andFilters.push({ deviceSn: params.deviceSn });
    if (params.errorCode) andFilters.push({ errorCode: params.errorCode });
    if (params.reasonCode) andFilters.push({ reasonCode: params.reasonCode });

    if (params.excludeNoisy) {
      andFilters.push({
        NOT: {
          eventName: {
            in: [
              'scan_device_found',
              'scan_device_filtered',
              'scan_device_updated',
              'scan_device_lost',
              'BLE RSSI update',
              'BLE connection params',
            ],
          },
        },
      });
    }

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
      const cursor = this.helper.decodeCursor(params.cursor);
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
        linkCode: true,
        requestId: true,
        attemptId: true,
        deviceMac: true,
        deviceSn: true,
        errorCode: true,
        reasonCode: true,
      },
    });

    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    const nextCursor =
      hasMore && page.length > 0
        ? this.helper.encodeCursor({
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
        msg: this.helper.msgPreviewFromJson(e.msgJson),
        linkCode: e.linkCode,
        requestId: e.requestId,
        attemptId: e.attemptId,
        deviceMac: e.deviceMac,
        deviceSn: e.deviceSn,
        errorCode: e.errorCode,
        reasonCode: this.normalizeOptionalText(e.reasonCode),
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
        linkCode: true,
        requestId: true,
        attemptId: true,
        deviceMac: true,
        deviceSn: true,
        errorCode: true,
        reasonCode: true,
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
      msg: this.helper.msgPreviewFromJson(event.msgJson),
      msgJson: event.msgJson,
      rawLine: event.rawLine,
      linkCode: event.linkCode,
      requestId: event.requestId,
      attemptId: event.attemptId,
      deviceMac: event.deviceMac,
      deviceSn: event.deviceSn,
      errorCode: event.errorCode,
      reasonCode: this.normalizeOptionalText(event.reasonCode),
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
      linkCode: true,
      requestId: true,
      deviceMac: true,
      deviceSn: true,
      errorCode: true,
      reasonCode: true,
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
      linkCode: string | null;
      requestId: string | null;
      deviceMac: string | null;
      deviceSn: string | null;
      errorCode: string | null;
      reasonCode: string | null;
    }) => ({
      id: e.id,
      logFileId: e.logFileId,
      timestampMs: Number(e.timestampMs),
      level: e.level,
      eventName: e.eventName,
      sdkVersion: e.sdkVersion,
      appId: e.appId,
      msg: this.helper.msgPreviewFromJson(e.msgJson),
      linkCode: e.linkCode,
      requestId: e.requestId,
      deviceMac: e.deviceMac,
      deviceSn: e.deviceSn,
      errorCode: e.errorCode,
      reasonCode: e.reasonCode,
    });

    return {
      logFileId: target.logFileId,
      before: beforeRows.slice().reverse().map(normalize),
      after: afterRows.map(normalize),
    };
  }
}
