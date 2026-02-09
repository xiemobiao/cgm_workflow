import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ApiException } from '../common/api-exception';
import { PrismaService } from '../database/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import {
  isBleConnectStartEvent,
  isBleConnectSuccessEvent,
  isBleDisconnectEvent,
} from './bluetooth-utils';

type CommandChainStats = {
  requestId: string;
  startMs: number;
  endMs: number | null;
  durationMs: number | null;
  status: 'success' | 'timeout' | 'error' | 'pending';
  eventCount: number;
  events: Array<{
    id: string;
    eventName: string;
    timestampMs: number;
    level: number;
  }>;
};

@Injectable()
export class BluetoothCommandService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
  ) {}

  async analyzeCommandChains(params: {
    actorUserId: string;
    projectId: string;
    logFileId?: string;
    startTime: string;
    endTime: string;
    deviceMac?: string;
    limit?: number;
  }) {
    await this.rbac.requireProjectRoles({
      userId: params.actorUserId,
      projectId: params.projectId,
      allowed: ['Admin', 'PM', 'Dev', 'QA', 'Release', 'Support', 'Viewer'],
    });

    if (params.logFileId) {
      await this.assertLogFileInProject({
        projectId: params.projectId,
        logFileId: params.logFileId,
      });
    }

    const startMs = BigInt(new Date(params.startTime).getTime());
    const endMs = BigInt(new Date(params.endTime).getTime());
    const limit = Math.min(Math.max(params.limit ?? 100, 1), 1000);

    const where: Prisma.LogEventWhereInput = {
      projectId: params.projectId,
      timestampMs: { gte: startMs, lte: endMs },
      requestId: { not: null },
    };

    if (params.logFileId) {
      where.logFileId = params.logFileId;
    }
    if (params.deviceMac) {
      where.deviceMac = params.deviceMac;
    }

    const events = await this.prisma.logEvent.findMany({
      where,
      orderBy: { timestampMs: 'asc' },
      take: limit * 10,
      select: {
        id: true,
        eventName: true,
        level: true,
        timestampMs: true,
        requestId: true,
        errorCode: true,
      },
    });

    const chains = this.extractCommandChains(
      events.map((event) => ({ ...event, msgJson: null })),
    );

    const durations = chains
      .filter((chain) => chain.durationMs !== null && chain.durationMs > 0)
      .map((chain) => chain.durationMs as number)
      .sort((a, b) => a - b);

    const stats = {
      total: chains.length,
      success: chains.filter((chain) => chain.status === 'success').length,
      timeout: chains.filter((chain) => chain.status === 'timeout').length,
      error: chains.filter((chain) => chain.status === 'error').length,
      pending: chains.filter((chain) => chain.status === 'pending').length,
      avgDurationMs:
        durations.length > 0
          ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
          : null,
      p50: this.percentile(durations, 50),
      p90: this.percentile(durations, 90),
      p99: this.percentile(durations, 99),
      slowest: chains
        .filter((chain) => chain.durationMs !== null)
        .sort((a, b) => (b.durationMs ?? 0) - (a.durationMs ?? 0))
        .slice(0, 5)
        .map((chain) => ({
          requestId: chain.requestId,
          durationMs: chain.durationMs,
          status: chain.status,
        })),
    };

    return {
      chains: chains.slice(0, limit),
      stats,
    };
  }

  buildCommandChains(
    events: Array<{
      id: string;
      eventName: string;
      level: number;
      timestampMs: bigint;
      msgJson: Prisma.JsonValue;
      requestId: string | null;
      errorCode: string | null;
    }>,
  ) {
    return this.extractCommandChains(events);
  }

  async getReconnectSummary(params: {
    actorUserId: string;
    projectId: string;
    logFileId?: string;
    startTime: string;
    endTime: string;
    deviceMac?: string;
    limit?: number;
    reconnectWindowMs?: number;
  }) {
    await this.rbac.requireProjectRoles({
      userId: params.actorUserId,
      projectId: params.projectId,
      allowed: ['Admin', 'PM', 'Dev', 'QA', 'Release', 'Support', 'Viewer'],
    });

    if (params.logFileId) {
      await this.assertLogFileInProject({
        projectId: params.projectId,
        logFileId: params.logFileId,
      });
    }

    const startMs = BigInt(new Date(params.startTime).getTime());
    const endMs = BigInt(new Date(params.endTime).getTime());
    const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
    const reconnectWindowMs = Math.min(
      Math.max(params.reconnectWindowMs ?? 5 * 60_000, 1_000),
      30 * 60_000,
    );

    const where: Prisma.LogEventWhereInput = {
      projectId: params.projectId,
      timestampMs: { gte: startMs, lte: endMs },
      stage: 'ble',
    };
    if (params.logFileId) {
      where.logFileId = params.logFileId;
    }
    if (params.deviceMac) {
      where.deviceMac = params.deviceMac;
    }

    const events = await this.prisma.logEvent.findMany({
      where,
      orderBy: { timestampMs: 'asc' },
      select: {
        id: true,
        logFileId: true,
        eventName: true,
        level: true,
        timestampMs: true,
        linkCode: true,
        deviceMac: true,
        deviceSn: true,
        attemptId: true,
        stage: true,
        op: true,
        result: true,
        errorCode: true,
        msgJson: true,
      },
    });

    const byDeviceKey = new Map<string, typeof events>();
    for (const event of events) {
      const key = event.deviceMac ?? event.deviceSn ?? event.linkCode;
      if (!key) continue;
      const list = byDeviceKey.get(key) ?? [];
      list.push(event);
      byDeviceKey.set(key, list);
    }

    const items: Array<{
      deviceKey: string;
      deviceMac: string | null;
      deviceSn: string | null;
      linkCodes: string[];
      disconnects: number;
      reconnectOk: number;
      reconnectUnresolved: number;
      reconnectDelayAvgMs: number | null;
      reconnectDelayP95Ms: number | null;
      reconnectDelayMaxMs: number | null;
      attemptsAvg: number | null;
      attemptsMax: number | null;
      topReasons: Array<{ reason: string; count: number }>;
      samples: Array<{
        logFileId: string;
        disconnectEventId: string;
        disconnectAtMs: number;
        reason: string | null;
        reconnectEventId: string | null;
        reconnectAtMs: number | null;
        reconnectDelayMs: number | null;
        attempts: number;
        attemptIds: string[];
      }>;
    }> = [];

    for (const [deviceKey, list] of byDeviceKey.entries()) {
      if (list.length === 0) continue;

      const linkCodes = [
        ...new Set(list.map((event) => event.linkCode).filter(Boolean)),
      ] as string[];
      const deviceMac =
        list.find((event) => event.deviceMac)?.deviceMac ?? null;
      const deviceSn = list.find((event) => event.deviceSn)?.deviceSn ?? null;

      const reasonsCount = new Map<string, number>();
      const reconnectCases: Array<{
        logFileId: string;
        disconnectEventId: string;
        disconnectAtMs: number;
        reason: string | null;
        reconnectEventId: string | null;
        reconnectAtMs: number | null;
        reconnectDelayMs: number | null;
        attempts: number;
        attemptIds: string[];
      }> = [];

      for (let i = 0; i < list.length; i += 1) {
        const event = list[i];
        if (!isBleDisconnectEvent(event)) continue;

        const disconnectAtMs = Number(event.timestampMs);
        const reason =
          this.extractDisconnectReason(event.msgJson) ?? event.errorCode;
        if (reason) {
          reasonsCount.set(reason, (reasonsCount.get(reason) ?? 0) + 1);
        }

        let reconnectEventId: string | null = null;
        let reconnectAtMs: number | null = null;
        let attempts = 0;
        const attemptIds = new Set<string>();

        for (let j = i + 1; j < list.length; j += 1) {
          const next = list[j];
          const ts = Number(next.timestampMs);
          if (ts - disconnectAtMs > reconnectWindowMs) break;
          if (isBleDisconnectEvent(next)) break;

          if (isBleConnectStartEvent(next)) {
            attempts += 1;
            if (next.attemptId) attemptIds.add(next.attemptId);
          }
          if (isBleConnectSuccessEvent(next)) {
            reconnectEventId = next.id;
            reconnectAtMs = ts;
            break;
          }
        }

        reconnectCases.push({
          logFileId: event.logFileId,
          disconnectEventId: event.id,
          disconnectAtMs,
          reason,
          reconnectEventId,
          reconnectAtMs,
          reconnectDelayMs:
            reconnectAtMs !== null ? reconnectAtMs - disconnectAtMs : null,
          attempts,
          attemptIds: Array.from(attemptIds.values()).slice(0, 10),
        });
      }

      if (reconnectCases.length === 0) continue;

      const delays = reconnectCases
        .map((item) => item.reconnectDelayMs)
        .filter(
          (value): value is number =>
            typeof value === 'number' && Number.isFinite(value) && value >= 0,
        )
        .sort((a, b) => a - b);

      const attemptsList = reconnectCases
        .map((item) => item.attempts)
        .filter((value) => Number.isFinite(value) && value >= 0)
        .sort((a, b) => a - b);

      const reconnectOk = reconnectCases.filter(
        (item) => item.reconnectAtMs !== null,
      ).length;
      const reconnectUnresolved = reconnectCases.length - reconnectOk;

      const reconnectDelayAvgMs =
        delays.length > 0
          ? Math.round(delays.reduce((a, b) => a + b, 0) / delays.length)
          : null;
      const reconnectDelayP95Ms = this.percentile(delays, 95);
      const reconnectDelayMaxMs =
        delays.length > 0 ? delays[delays.length - 1] : null;

      const attemptsAvg =
        attemptsList.length > 0
          ? Math.round(
              attemptsList.reduce((a, b) => a + b, 0) / attemptsList.length,
            )
          : null;
      const attemptsMax =
        attemptsList.length > 0 ? attemptsList[attemptsList.length - 1] : null;

      const topReasons = Array.from(reasonsCount.entries())
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      const samples = reconnectCases
        .slice()
        .sort((a, b) => {
          const av = a.reconnectDelayMs ?? Number.POSITIVE_INFINITY;
          const bv = b.reconnectDelayMs ?? Number.POSITIVE_INFINITY;
          return bv - av;
        })
        .slice(0, 5);

      items.push({
        deviceKey,
        deviceMac,
        deviceSn,
        linkCodes,
        disconnects: reconnectCases.length,
        reconnectOk,
        reconnectUnresolved,
        reconnectDelayAvgMs,
        reconnectDelayP95Ms,
        reconnectDelayMaxMs,
        attemptsAvg,
        attemptsMax,
        topReasons,
        samples,
      });
    }

    const sorted = items
      .slice()
      .sort((a, b) => {
        if (a.reconnectUnresolved !== b.reconnectUnresolved) {
          return b.reconnectUnresolved - a.reconnectUnresolved;
        }
        const av = a.reconnectDelayMaxMs ?? -1;
        const bv = b.reconnectDelayMaxMs ?? -1;
        if (av !== bv) return bv - av;
        return b.disconnects - a.disconnects;
      })
      .slice(0, limit);

    const totalDisconnects = sorted.reduce(
      (sum, item) => sum + item.disconnects,
      0,
    );

    return {
      items: sorted,
      summary: {
        totalDevices: sorted.length,
        totalDisconnects,
        reconnectWindowMs,
      },
    };
  }

  private extractCommandChains(
    events: Array<{
      id: string;
      eventName: string;
      level: number;
      timestampMs: bigint;
      msgJson: Prisma.JsonValue;
      requestId: string | null;
      errorCode: string | null;
    }>,
  ): CommandChainStats[] {
    const chains = new Map<string, CommandChainStats>();

    for (const event of events) {
      if (!event.requestId) continue;

      const existing = chains.get(event.requestId);
      const ts = Number(event.timestampMs);

      if (!existing) {
        chains.set(event.requestId, {
          requestId: event.requestId,
          startMs: ts,
          endMs: ts,
          durationMs: 0,
          status: 'pending',
          eventCount: 1,
          events: [
            {
              id: event.id,
              eventName: event.eventName,
              timestampMs: ts,
              level: event.level,
            },
          ],
        });
      } else {
        existing.endMs = ts;
        existing.durationMs = existing.endMs - existing.startMs;
        existing.eventCount += 1;
        existing.events.push({
          id: event.id,
          eventName: event.eventName,
          timestampMs: ts,
          level: event.level,
        });

        const name = event.eventName.toUpperCase();
        if (event.level >= 4 || event.errorCode) {
          existing.status = name.includes('TIMEOUT') ? 'timeout' : 'error';
        } else if (
          name.includes('SUCCESS') ||
          name.includes('RESPONSE') ||
          name.includes('COMPLETE')
        ) {
          existing.status = 'success';
        }
      }
    }

    return Array.from(chains.values()).sort((a, b) => a.startMs - b.startMs);
  }

  private percentile(sorted: number[], p: number): number | null {
    if (sorted.length === 0) return null;
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
  }

  private extractDisconnectReason(msgJson: Prisma.JsonValue): string | null {
    if (!msgJson) return null;

    if (typeof msgJson === 'string') {
      const text = msgJson.trim();
      return text.length > 0 ? text.slice(0, 120) : null;
    }

    if (typeof msgJson === 'object' && msgJson !== null) {
      const obj = msgJson as Record<string, unknown>;
      const keys = [
        'reason',
        'error',
        'errorCode',
        'desc',
        'message',
        'msg',
      ] as const;
      for (const key of keys) {
        const val = obj[key];
        if (typeof val === 'string' && val.trim().length > 0) {
          return val.trim().slice(0, 120);
        }
      }
      try {
        const serialized = JSON.stringify(obj);
        if (serialized && serialized !== '{}') return serialized.slice(0, 120);
      } catch {
        return null;
      }
    }

    return null;
  }

  private async assertLogFileInProject(params: {
    projectId: string;
    logFileId: string;
  }) {
    const file = await this.prisma.logFile.findFirst({
      where: { id: params.logFileId, projectId: params.projectId },
      select: { id: true },
    });

    if (!file) {
      throw new ApiException({
        code: 'LOG_FILE_NOT_FOUND',
        message: 'Log file not found in project',
        status: 404,
      });
    }
  }
}
