import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { RbacService } from '../../rbac/rbac.service';
import { LogsHelperService } from './logs-helper.service';

/**
 * Service for log event statistics, error hotspots, timeline, and command chains.
 */
@Injectable()
export class LogsStatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
    private readonly helper: LogsHelperService,
  ) {}

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

    if (params.logFileId) {
      await this.helper.assertLogFileInProject({
        projectId: params.projectId,
        logFileId: params.logFileId,
      });
    }

    const whereClause: Prisma.LogEventStatsWhereInput = {
      projectId: params.projectId,
    };

    if (params.logFileId) {
      whereClause.logFileId = params.logFileId;
    }

    const stats = await this.prisma.logEventStats.findMany({
      where: whereClause,
      select: {
        eventName: true,
        level: true,
        count: true,
      },
    });

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
      errorRate: Math.round(errorRate * 10000) / 100,
    };
  }

  async getErrorHotspots(params: {
    actorUserId: string;
    projectId: string;
    logFileId?: string;
    startTime: string;
    endTime: string;
    limit?: number;
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
    const limit = Math.min(Math.max(params.limit ?? 20, 1), 100);

    const errorEvents = await this.prisma.logEvent.groupBy({
      by: ['eventName', 'errorCode'],
      where: {
        projectId: params.projectId,
        ...(params.logFileId ? { logFileId: params.logFileId } : {}),
        timestampMs: { gte: startMs, lte: endMs },
        level: { gte: 3 },
      },
      _count: true,
      _max: { timestampMs: true },
    });

    const sorted = errorEvents
      .sort((a, b) => (b._count ?? 0) - (a._count ?? 0))
      .slice(0, limit);

    return {
      items: sorted.map((e) => ({
        eventName: e.eventName,
        errorCode: e.errorCode,
        count: e._count ?? 0,
        lastSeenMs: e._max?.timestampMs ? Number(e._max.timestampMs) : null,
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

    if (params.logFileId) {
      await this.helper.assertLogFileInProject({
        projectId: params.projectId,
        logFileId: params.logFileId,
      });
    }

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
        whereClause.timestampMs.gte = BigInt(
          new Date(params.startTime).getTime(),
        );
      }
      if (params.endTime) {
        whereClause.timestampMs.lte = BigInt(
          new Date(params.endTime).getTime(),
        );
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
        deviceSn: true,
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
        deviceSn: e.deviceSn,
        linkCode: e.linkCode,
        requestId: e.requestId,
        errorCode: e.errorCode,
        msg: this.helper.msgPreviewFromJson(e.msgJson),
      })),
    };
  }

  async getCommandChains(params: {
    actorUserId: string;
    projectId: string;
    logFileId?: string;
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

    if (params.logFileId) {
      await this.helper.assertLogFileInProject({
        projectId: params.projectId,
        logFileId: params.logFileId,
      });
    }

    const startMs = BigInt(new Date(params.startTime).getTime());
    const endMs = BigInt(new Date(params.endTime).getTime());
    const limit = Math.min(Math.max(params.limit ?? 100, 1), 500);
    const maxScanEvents = Math.min(limit * 200, 50000);

    // First try to find events with requestId
    const requestIdEvents = await this.prisma.logEvent.findMany({
      where: {
        projectId: params.projectId,
        ...(params.logFileId ? { logFileId: params.logFileId } : {}),
        requestId: { not: null },
        timestampMs: { gte: startMs, lte: endMs },
        ...(params.deviceMac ? { deviceMac: params.deviceMac } : {}),
      },
      orderBy: [{ timestampMs: 'desc' }],
      take: maxScanEvents,
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

    if (requestIdEvents.length > 0) {
      return this.buildCommandChainsFromRequestId(requestIdEvents, limit);
    }

    // Fallback: Query protocol/command events
    const commandEventNames = [
      'protocol_command_sent',
      'protocol_response_received',
      'protocol_created',
      'data_request_start',
      'data_request_success',
      'BLE auth sendKey',
      'BLE auth success',
      'BLE start connection',
      'BLE connection success',
      'BLE search success',
      'BLE query device status',
      'BLE query device status success',
      'BLE query sn',
      'BLE query sn success',
      'BLE query active time',
      'BLE query active time success',
    ];

    const commandEvents = await this.prisma.logEvent.findMany({
      where: {
        projectId: params.projectId,
        ...(params.logFileId ? { logFileId: params.logFileId } : {}),
        eventName: { in: commandEventNames },
        timestampMs: { gte: startMs, lte: endMs },
        ...(params.deviceMac ? { deviceMac: params.deviceMac } : {}),
      },
      orderBy: [{ timestampMs: 'desc' }],
      take: maxScanEvents,
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

    return this.buildCommandChainsFromEvents(
      commandEvents.slice().reverse(),
      limit,
    );
  }

  private buildCommandChainsFromRequestId(
    events: Array<{
      id: string;
      eventName: string;
      level: number;
      timestampMs: bigint;
      requestId: string | null;
      deviceMac: string | null;
      errorCode: string | null;
      msgJson: unknown;
    }>,
    limit: number,
  ) {
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

    const chains = Array.from(chainMap.values())
      .slice(0, limit)
      .map((chain) =>
        this.buildChainResult(chain.requestId, chain.deviceMac, chain.events),
      );

    chains.sort((a, b) => b.startTime - a.startTime);
    return { count: chains.length, items: chains };
  }

  private buildCommandChainsFromEvents(
    events: Array<{
      id: string;
      eventName: string;
      level: number;
      timestampMs: bigint;
      requestId: string | null;
      deviceMac: string | null;
      errorCode: string | null;
      msgJson: unknown;
    }>,
    limit: number,
  ) {
    const chainMap = new Map<
      string,
      {
        commandKey: string;
        deviceMac: string | null;
        events: typeof events;
      }
    >();

    const TIME_WINDOW_MS = 5000;
    let sequenceCounter = 0;
    let lastTimestamp = 0n;

    for (const event of events) {
      const { commandName, commandCode } = this.helper.extractCommandInfo(
        event.msgJson,
      );
      const baseKey = commandName || commandCode || event.eventName;

      if (Number(event.timestampMs - lastTimestamp) > TIME_WINDOW_MS) {
        sequenceCounter++;
      }
      lastTimestamp = event.timestampMs;

      const commandKey = `${baseKey}#${sequenceCounter}`;

      const existing = chainMap.get(commandKey);
      if (existing) {
        existing.events.push(event);
        if (!existing.deviceMac && event.deviceMac) {
          existing.deviceMac = event.deviceMac;
        }
      } else {
        chainMap.set(commandKey, {
          commandKey,
          deviceMac: event.deviceMac,
          events: [event],
        });
      }
    }

    const chains = Array.from(chainMap.values())
      .slice(0, limit)
      .map((chain) => {
        const displayKey = chain.commandKey.split('#')[0];
        return this.buildChainResult(displayKey, chain.deviceMac, chain.events);
      });

    chains.sort((a, b) => b.startTime - a.startTime);
    return { count: chains.length, items: chains };
  }

  private buildChainResult(
    requestId: string,
    deviceMac: string | null,
    events: Array<{
      id: string;
      eventName: string;
      level: number;
      timestampMs: bigint;
      errorCode: string | null;
      msgJson: unknown;
    }>,
  ) {
    const sortedEvents = [...events].sort(
      (a, b) => Number(a.timestampMs) - Number(b.timestampMs),
    );

    const firstEvent = sortedEvents[0];
    const lastEvent = sortedEvents[sortedEvents.length - 1];
    const duration =
      Number(lastEvent.timestampMs) - Number(firstEvent.timestampMs);

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
      requestId,
      deviceMac,
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
        msg: this.helper.msgPreviewFromJson(e.msgJson),
      })),
    };
  }
}
