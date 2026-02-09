import { Injectable } from '@nestjs/common';
import { AnomalyType, Prisma } from '@prisma/client';
import { ApiException } from '../common/api-exception';
import { PrismaService } from '../database/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import {
  extractMsgPreview,
  isBleDisconnectEvent,
  isBleOp,
  normalizeLower,
} from './bluetooth-utils';

const ANOMALY_THRESHOLDS = {
  frequentDisconnect: { count: 3, windowMs: 60000 },
  timeoutRetry: { count: 2, windowMs: 30000 },
  errorBurst: { count: 5, windowMs: 10000 },
  slowConnection: { thresholdMs: 10000 },
  commandFailure: { rate: 0.3 },
};

const KNOWN_ERROR_PATTERNS: Array<{
  pattern: RegExp;
  category: string;
  severity: number;
  suggestion: string;
}> = [
  {
    pattern: /GATT_ERROR|GATT_FAILURE/i,
    category: 'gatt_error',
    severity: 4,
    suggestion:
      'GATT operation failed. Check Bluetooth connection stability and retry.',
  },
  {
    pattern: /CONNECTION_TIMEOUT|CONNECT_TIMEOUT/i,
    category: 'connection_timeout',
    severity: 3,
    suggestion:
      'Connection timeout. Ensure device is in range and not paired with other devices.',
  },
  {
    pattern: /BOND_FAILED|PAIRING_FAILED/i,
    category: 'pairing_failure',
    severity: 4,
    suggestion: 'Pairing failed. Remove device bond and try again.',
  },
  {
    pattern: /SERVICE_NOT_FOUND|CHARACTERISTIC_NOT_FOUND/i,
    category: 'service_missing',
    severity: 5,
    suggestion:
      'BLE service/characteristic not found. Check device firmware version.',
  },
  {
    pattern: /WRITE_FAILED|READ_FAILED/i,
    category: 'io_error',
    severity: 3,
    suggestion:
      'BLE read/write operation failed. Verify connection is still active.',
  },
  {
    pattern: /DISCONNECTED_UNEXPECTEDLY|CONNECTION_LOST/i,
    category: 'unexpected_disconnect',
    severity: 4,
    suggestion:
      'Unexpected disconnection. Check for interference or low battery.',
  },
  {
    pattern: /CRC_ERROR|CHECKSUM/i,
    category: 'data_corruption',
    severity: 5,
    suggestion: 'Data corruption detected. Check for signal interference.',
  },
  {
    pattern: /BLUETOOTH_OFF|ADAPTER_DISABLED/i,
    category: 'bluetooth_disabled',
    severity: 2,
    suggestion: 'Bluetooth is disabled. Enable Bluetooth in system settings.',
  },
  {
    pattern: /PERMISSION_DENIED|LOCATION_REQUIRED/i,
    category: 'permission_error',
    severity: 2,
    suggestion:
      'Missing permissions. Grant Bluetooth and location permissions.',
  },
];

const CONNECTION_FLOW_PATTERNS = {
  normal: [
    'SCAN',
    'FOUND',
    'CONNECT',
    'CONNECTED',
    'DISCOVER',
    'ENABLE',
    'WRITE',
    'READ',
  ],
  disconnect: ['DISCONNECT', 'DISCONNECTED', 'CLOSE', 'RELEASE'],
  error: ['ERROR', 'FAILED', 'TIMEOUT', 'EXCEPTION'],
};

@Injectable()
export class BluetoothAnomalyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
  ) {}

  async detectAnomalies(params: {
    actorUserId: string;
    projectId: string;
    logFileId?: string;
    startTime: string;
    endTime: string;
    deviceMac?: string;
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

    const where: Prisma.LogEventWhereInput = {
      projectId: params.projectId,
      timestampMs: { gte: startMs, lte: endMs },
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
        eventName: true,
        level: true,
        timestampMs: true,
        linkCode: true,
        attemptId: true,
        deviceMac: true,
        errorCode: true,
        sdkVersion: true,
        stage: true,
        op: true,
        result: true,
      },
    });

    const patterns: Array<{
      patternType: AnomalyType;
      description: string;
      severity: number;
      occurrenceCount: number;
      affectedSessions: number;
      sampleEventIds: string[];
      deviceMac: string | null;
      sdkVersion: string | null;
    }> = [];

    const disconnectEvents = events.filter((event) =>
      isBleDisconnectEvent(event),
    );
    if (
      disconnectEvents.length >= ANOMALY_THRESHOLDS.frequentDisconnect.count
    ) {
      const affectedLinkCodes = new Set(
        disconnectEvents.map((event) => event.linkCode).filter(Boolean),
      );
      patterns.push({
        patternType: AnomalyType.frequent_disconnect,
        description: `Detected ${disconnectEvents.length} disconnect events`,
        severity: disconnectEvents.length >= 5 ? 4 : 3,
        occurrenceCount: disconnectEvents.length,
        affectedSessions: affectedLinkCodes.size,
        sampleEventIds: disconnectEvents.slice(0, 5).map((event) => event.id),
        deviceMac: disconnectEvents[0]?.deviceMac ?? null,
        sdkVersion: disconnectEvents[0]?.sdkVersion ?? null,
      });
    }

    const timeoutEvents = events.filter((event) => {
      if (isBleOp(event, 'connect')) {
        const result = normalizeLower(event.result);
        if (result === 'timeout' || result === 'retry' || result === 'fail')
          return true;
      }
      const upper = event.eventName.toUpperCase();
      return (
        upper.includes('TIMEOUT') ||
        (event.level >= 4 && upper.includes('RETRY'))
      );
    });
    if (timeoutEvents.length >= ANOMALY_THRESHOLDS.timeoutRetry.count) {
      const affectedLinkCodes = new Set(
        timeoutEvents.map((event) => event.linkCode).filter(Boolean),
      );
      patterns.push({
        patternType: AnomalyType.timeout_retry,
        description: `Detected ${timeoutEvents.length} timeout/retry events`,
        severity: timeoutEvents.length >= 4 ? 4 : 3,
        occurrenceCount: timeoutEvents.length,
        affectedSessions: affectedLinkCodes.size,
        sampleEventIds: timeoutEvents.slice(0, 5).map((event) => event.id),
        deviceMac: timeoutEvents[0]?.deviceMac ?? null,
        sdkVersion: timeoutEvents[0]?.sdkVersion ?? null,
      });
    }

    const errorEvents = events.filter((event) => event.level >= 4);
    if (errorEvents.length >= ANOMALY_THRESHOLDS.errorBurst.count) {
      const affectedLinkCodes = new Set(
        errorEvents.map((event) => event.linkCode).filter(Boolean),
      );
      patterns.push({
        patternType: AnomalyType.error_burst,
        description: `Detected ${errorEvents.length} error-level events`,
        severity: errorEvents.length >= 10 ? 5 : 4,
        occurrenceCount: errorEvents.length,
        affectedSessions: affectedLinkCodes.size,
        sampleEventIds: errorEvents.slice(0, 5).map((event) => event.id),
        deviceMac: errorEvents[0]?.deviceMac ?? null,
        sdkVersion: errorEvents[0]?.sdkVersion ?? null,
      });
    }

    return {
      patterns,
      summary: {
        totalEvents: events.length,
        errorEvents: errorEvents.length,
        disconnectEvents: disconnectEvents.length,
        timeoutEvents: timeoutEvents.length,
      },
    };
  }

  async getErrorDistribution(params: {
    actorUserId: string;
    projectId: string;
    logFileId?: string;
    startTime: string;
    endTime: string;
    deviceMac?: string;
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

    const where: Prisma.LogEventWhereInput = {
      projectId: params.projectId,
      timestampMs: { gte: startMs, lte: endMs },
      OR: [{ level: { gte: 3 } }, { errorCode: { not: null } }],
    };

    if (params.logFileId) {
      where.logFileId = params.logFileId;
    }
    if (params.deviceMac) {
      where.deviceMac = params.deviceMac;
    }

    const events = await this.prisma.logEvent.findMany({
      where,
      select: {
        eventName: true,
        errorCode: true,
        level: true,
        timestampMs: true,
      },
    });

    const byErrorCode = new Map<string, { count: number; lastSeen: number }>();
    for (const event of events) {
      const code = event.errorCode ?? 'UNKNOWN';
      const existing = byErrorCode.get(code);
      const ts = Number(event.timestampMs);
      if (existing) {
        existing.count += 1;
        existing.lastSeen = Math.max(existing.lastSeen, ts);
      } else {
        byErrorCode.set(code, { count: 1, lastSeen: ts });
      }
    }

    const byEventName = new Map<string, { count: number; lastSeen: number }>();
    for (const event of events) {
      const existing = byEventName.get(event.eventName);
      const ts = Number(event.timestampMs);
      if (existing) {
        existing.count += 1;
        existing.lastSeen = Math.max(existing.lastSeen, ts);
      } else {
        byEventName.set(event.eventName, { count: 1, lastSeen: ts });
      }
    }

    const byLevel = new Map<number, number>();
    for (const event of events) {
      byLevel.set(event.level, (byLevel.get(event.level) ?? 0) + 1);
    }

    return {
      total: events.length,
      byErrorCode: Array.from(byErrorCode.entries())
        .map(([code, data]) => ({ code, ...data }))
        .sort((a, b) => b.count - a.count),
      byEventName: Array.from(byEventName.entries())
        .map(([name, data]) => ({ name, ...data }))
        .sort((a, b) => b.count - a.count),
      byLevel: Array.from(byLevel.entries())
        .map(([level, count]) => ({ level, count }))
        .sort((a, b) => b.level - a.level),
    };
  }

  async analyzeErrorsWithContext(params: {
    actorUserId: string;
    projectId: string;
    eventId: string;
    contextSize?: number;
  }) {
    await this.rbac.requireProjectRoles({
      userId: params.actorUserId,
      projectId: params.projectId,
      allowed: ['Admin', 'PM', 'Dev', 'QA', 'Release', 'Support', 'Viewer'],
    });

    const contextSize = params.contextSize ?? 10;

    const targetEvent = await this.prisma.logEvent.findFirst({
      where: { id: params.eventId, projectId: params.projectId },
      select: {
        id: true,
        eventName: true,
        level: true,
        timestampMs: true,
        msgJson: true,
        linkCode: true,
        requestId: true,
        deviceMac: true,
        errorCode: true,
        sdkVersion: true,
        logFileId: true,
      },
    });

    if (!targetEvent) {
      return null;
    }

    const contextBaseWhere: Prisma.LogEventWhereInput = {
      projectId: params.projectId,
    };
    if (targetEvent.logFileId) {
      contextBaseWhere.logFileId = targetEvent.logFileId;
    }

    const [beforeEvents, afterEvents] = await Promise.all([
      this.prisma.logEvent.findMany({
        where: {
          ...contextBaseWhere,
          timestampMs: { lt: targetEvent.timestampMs },
        },
        orderBy: { timestampMs: 'desc' },
        take: contextSize,
        select: {
          id: true,
          eventName: true,
          level: true,
          timestampMs: true,
          msgJson: true,
          requestId: true,
          errorCode: true,
        },
      }),
      this.prisma.logEvent.findMany({
        where: {
          ...contextBaseWhere,
          timestampMs: { gt: targetEvent.timestampMs },
        },
        orderBy: { timestampMs: 'asc' },
        take: contextSize,
        select: {
          id: true,
          eventName: true,
          level: true,
          timestampMs: true,
          msgJson: true,
          requestId: true,
          errorCode: true,
        },
      }),
    ]);

    const errorAnalysis = this.analyzeErrorPattern(
      targetEvent.eventName,
      targetEvent.errorCode,
    );

    const relatedEvents = await this.findRelatedEvents(
      params.projectId,
      targetEvent,
      targetEvent.logFileId,
    );

    const beforeChronological = [...beforeEvents].reverse();
    const flowContext = this.analyzeConnectionFlow(
      [...beforeChronological, targetEvent, ...afterEvents].map((event) => ({
        eventName: event.eventName,
        level: event.level,
      })),
    );

    return {
      event: {
        id: targetEvent.id,
        eventName: targetEvent.eventName,
        level: targetEvent.level,
        timestampMs: Number(targetEvent.timestampMs),
        msg: extractMsgPreview(targetEvent.msgJson),
        errorCode: targetEvent.errorCode,
        deviceMac: targetEvent.deviceMac,
        sdkVersion: targetEvent.sdkVersion,
      },
      context: {
        before: beforeChronological.map((event) => ({
          id: event.id,
          eventName: event.eventName,
          level: event.level,
          timestampMs: Number(event.timestampMs),
          msg: extractMsgPreview(event.msgJson),
        })),
        after: afterEvents.map((event) => ({
          id: event.id,
          eventName: event.eventName,
          level: event.level,
          timestampMs: Number(event.timestampMs),
          msg: extractMsgPreview(event.msgJson),
        })),
      },
      analysis: {
        ...errorAnalysis,
        flowContext,
        relatedCount: relatedEvents.length,
      },
      related: relatedEvents.slice(0, 20),
    };
  }

  async detectAnomaliesEnhanced(params: {
    actorUserId: string;
    projectId: string;
    logFileId?: string;
    startTime: string;
    endTime: string;
    deviceMac?: string;
  }) {
    await this.rbac.requireProjectRoles({
      userId: params.actorUserId,
      projectId: params.projectId,
      allowed: ['Admin', 'PM', 'Dev', 'QA', 'Release', 'Support', 'Viewer'],
    });

    return this.detectAnomaliesEnhancedInternal({
      projectId: params.projectId,
      logFileId: params.logFileId,
      startTime: params.startTime,
      endTime: params.endTime,
      deviceMac: params.deviceMac,
    });
  }

  async detectAnomaliesEnhancedInternal(params: {
    projectId: string;
    logFileId?: string;
    startTime: string;
    endTime: string;
    deviceMac?: string;
  }) {
    if (params.logFileId) {
      await this.assertLogFileInProject({
        projectId: params.projectId,
        logFileId: params.logFileId,
      });
    }

    const startMs = BigInt(new Date(params.startTime).getTime());
    const endMs = BigInt(new Date(params.endTime).getTime());

    const where: Prisma.LogEventWhereInput = {
      projectId: params.projectId,
      timestampMs: { gte: startMs, lte: endMs },
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
        eventName: true,
        level: true,
        timestampMs: true,
        linkCode: true,
        deviceMac: true,
        attemptId: true,
        errorCode: true,
        sdkVersion: true,
        msgJson: true,
        stage: true,
        op: true,
        result: true,
      },
    });

    const anomalies: Array<{
      type: AnomalyType;
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
    }> = [];

    const disconnectClusters = this.findEventClusters(
      events.filter((event) => isBleDisconnectEvent(event)),
      ANOMALY_THRESHOLDS.frequentDisconnect.windowMs,
    );

    for (const cluster of disconnectClusters) {
      if (
        cluster.events.length >= ANOMALY_THRESHOLDS.frequentDisconnect.count
      ) {
        const affectedSessions = [
          ...new Set(
            cluster.events.map((event) => event.linkCode).filter(Boolean),
          ),
        ] as string[];
        anomalies.push({
          type: AnomalyType.frequent_disconnect,
          severity: cluster.events.length >= 5 ? 5 : 4,
          description: `${cluster.events.length} disconnects in ${Math.round(cluster.windowMs / 1000)}s`,
          suggestion:
            'Check for connection stability issues, signal interference, or device battery.',
          occurrences: cluster.events.length,
          affectedSessions,
          timeWindowMs: cluster.windowMs,
          sampleEvents: cluster.events.slice(0, 5).map((event) => ({
            id: event.id,
            eventName: event.eventName,
            timestampMs: Number(event.timestampMs),
          })),
        });
      }
    }

    const timeoutEvents = events.filter((event) => {
      if (isBleOp(event, 'connect')) {
        const result = normalizeLower(event.result);
        if (result === 'timeout' || result === 'retry' || result === 'fail')
          return true;
      }
      return event.eventName.toUpperCase().includes('TIMEOUT');
    });
    const timeoutClusters = this.findEventClusters(
      timeoutEvents,
      ANOMALY_THRESHOLDS.timeoutRetry.windowMs,
    );

    for (const cluster of timeoutClusters) {
      if (cluster.events.length >= ANOMALY_THRESHOLDS.timeoutRetry.count) {
        const affectedSessions = [
          ...new Set(
            cluster.events.map((event) => event.linkCode).filter(Boolean),
          ),
        ] as string[];
        anomalies.push({
          type: AnomalyType.timeout_retry,
          severity: cluster.events.length >= 4 ? 4 : 3,
          description: `${cluster.events.length} timeouts in ${Math.round(cluster.windowMs / 1000)}s`,
          suggestion:
            'Device may be unresponsive. Check device status and connection quality.',
          occurrences: cluster.events.length,
          affectedSessions,
          timeWindowMs: cluster.windowMs,
          sampleEvents: cluster.events.slice(0, 5).map((event) => ({
            id: event.id,
            eventName: event.eventName,
            timestampMs: Number(event.timestampMs),
          })),
        });
      }
    }

    const errorEvents = events.filter((event) => event.level >= 4);
    const errorClusters = this.findEventClusters(
      errorEvents,
      ANOMALY_THRESHOLDS.errorBurst.windowMs,
    );

    for (const cluster of errorClusters) {
      if (cluster.events.length >= ANOMALY_THRESHOLDS.errorBurst.count) {
        const affectedSessions = [
          ...new Set(
            cluster.events.map((event) => event.linkCode).filter(Boolean),
          ),
        ] as string[];
        const errorCategories = cluster.events.map(
          (event) =>
            this.analyzeErrorPattern(event.eventName, event.errorCode).category,
        );
        const topCategory = this.getMostFrequent(errorCategories);

        anomalies.push({
          type: AnomalyType.error_burst,
          severity: cluster.events.length >= 10 ? 5 : 4,
          description: `${cluster.events.length} errors in ${Math.round(cluster.windowMs / 1000)}s (mostly ${topCategory})`,
          suggestion:
            'Multiple errors occurred rapidly. Review the error sequence to identify root cause.',
          occurrences: cluster.events.length,
          affectedSessions,
          timeWindowMs: cluster.windowMs,
          sampleEvents: cluster.events.slice(0, 5).map((event) => ({
            id: event.id,
            eventName: event.eventName,
            timestampMs: Number(event.timestampMs),
          })),
        });
      }
    }

    const sessions = await this.prisma.deviceSession.findMany({
      where: {
        projectId: params.projectId,
        startTimeMs: { gte: startMs },
        endTimeMs: { lte: endMs },
        ...(params.deviceMac ? { deviceMac: params.deviceMac } : {}),
      },
      select: {
        linkCode: true,
        scanStartMs: true,
        connectedMs: true,
        status: true,
      },
    });

    const slowSessions = sessions.filter((session) => {
      if (!session.scanStartMs || !session.connectedMs) return false;
      const connectionTime = Number(session.connectedMs - session.scanStartMs);
      return connectionTime > ANOMALY_THRESHOLDS.slowConnection.thresholdMs;
    });

    if (slowSessions.length > 0) {
      anomalies.push({
        type: AnomalyType.slow_connection,
        severity: slowSessions.length >= 3 ? 4 : 3,
        description: `${slowSessions.length} sessions took >10s to connect`,
        suggestion:
          'Connection is slow. Check for interference, device distance, or pairing issues.',
        occurrences: slowSessions.length,
        affectedSessions: slowSessions.map((session) => session.linkCode),
        timeWindowMs: Number(endMs - startMs),
        sampleEvents: [],
      });
    }

    const commandEvents = events.filter(
      (event) =>
        event.eventName.toUpperCase().includes('COMMAND') ||
        event.eventName.toUpperCase().includes('REQUEST') ||
        event.eventName.toUpperCase().includes('WRITE'),
    );

    const failedCommands = commandEvents.filter((event) => event.level >= 4);
    const failureRate =
      commandEvents.length > 0
        ? failedCommands.length / commandEvents.length
        : 0;

    if (
      failureRate > ANOMALY_THRESHOLDS.commandFailure.rate &&
      commandEvents.length >= 5
    ) {
      anomalies.push({
        type: AnomalyType.command_failure,
        severity: failureRate > 0.5 ? 5 : 4,
        description: `${Math.round(failureRate * 100)}% command failure rate (${failedCommands.length}/${commandEvents.length})`,
        suggestion:
          'High command failure rate. Check device responsiveness and data format.',
        occurrences: failedCommands.length,
        affectedSessions: [
          ...new Set(
            failedCommands.map((event) => event.linkCode).filter(Boolean),
          ),
        ] as string[],
        timeWindowMs: Number(endMs - startMs),
        sampleEvents: failedCommands.slice(0, 5).map((event) => ({
          id: event.id,
          eventName: event.eventName,
          timestampMs: Number(event.timestampMs),
        })),
      });
    }

    anomalies.sort((a, b) => b.severity - a.severity);

    return {
      anomalies,
      summary: {
        totalAnomalies: anomalies.length,
        criticalCount: anomalies.filter((anomaly) => anomaly.severity >= 5)
          .length,
        highCount: anomalies.filter((anomaly) => anomaly.severity === 4).length,
        mediumCount: anomalies.filter((anomaly) => anomaly.severity === 3)
          .length,
        affectedSessionsCount: new Set(
          anomalies.flatMap((anomaly) => anomaly.affectedSessions),
        ).size,
      },
      recommendations: this.generateRecommendations(anomalies),
    };
  }

  private analyzeErrorPattern(eventName: string, errorCode: string | null) {
    const combined = `${eventName} ${errorCode ?? ''}`;

    for (const known of KNOWN_ERROR_PATTERNS) {
      if (known.pattern.test(combined)) {
        return {
          category: known.category,
          severity: known.severity,
          suggestion: known.suggestion,
          matched: true,
        };
      }
    }

    const name = eventName.toUpperCase();
    let category = 'unknown';
    let severity = 3;
    let suggestion = 'Check device connection and retry the operation.';

    if (name.includes('TIMEOUT')) {
      category = 'timeout';
      severity = 3;
      suggestion =
        'Operation timed out. Check device responsiveness and connection quality.';
    } else if (name.includes('ERROR') || name.includes('FAILED')) {
      category = 'general_error';
      severity = 4;
      suggestion =
        'An error occurred. Review the message details for more information.';
    } else if (name.includes('DISCONNECT')) {
      category = 'disconnect';
      severity = 3;
      suggestion =
        'Device disconnected. Check if this was expected or triggered by an error.';
    }

    return {
      category,
      severity,
      suggestion,
      matched: false,
    };
  }

  private async findRelatedEvents(
    projectId: string,
    targetEvent: {
      linkCode: string | null;
      requestId: string | null;
      timestampMs: bigint;
    },
    logFileId?: string | null,
  ) {
    const conditions: Prisma.LogEventWhereInput[] = [];

    if (targetEvent.linkCode) {
      conditions.push({ linkCode: targetEvent.linkCode });
    }
    if (targetEvent.requestId) {
      conditions.push({ requestId: targetEvent.requestId });
    }

    if (conditions.length === 0) {
      return [];
    }

    const where: Prisma.LogEventWhereInput = {
      projectId,
      OR: conditions,
    };
    if (logFileId) {
      where.logFileId = logFileId;
    }

    const related = await this.prisma.logEvent.findMany({
      where,
      orderBy: { timestampMs: 'asc' },
      take: 50,
      select: {
        id: true,
        eventName: true,
        level: true,
        timestampMs: true,
        linkCode: true,
        requestId: true,
        errorCode: true,
      },
    });

    return related.map((event) => ({
      id: event.id,
      eventName: event.eventName,
      level: event.level,
      timestampMs: Number(event.timestampMs),
      linkCode: event.linkCode,
      requestId: event.requestId,
      errorCode: event.errorCode,
    }));
  }

  private analyzeConnectionFlow(
    events: Array<{ eventName: string; level: number }>,
  ): {
    phase: string;
    flowType: 'normal' | 'error' | 'incomplete';
    lastNormalStep: string | null;
    errorPoint: string | null;
  } {
    let lastNormalStep: string | null = null;
    let errorPoint: string | null = null;
    let phase = 'unknown';
    let flowType: 'normal' | 'error' | 'incomplete' = 'normal';

    for (const event of events) {
      const name = event.eventName.toUpperCase();

      for (const step of CONNECTION_FLOW_PATTERNS.normal) {
        if (name.includes(step)) {
          lastNormalStep = step;
          phase = step.toLowerCase();
          break;
        }
      }

      if (
        event.level >= 4 ||
        CONNECTION_FLOW_PATTERNS.error.some((item) => name.includes(item))
      ) {
        flowType = 'error';
        errorPoint = event.eventName;
      }

      if (
        CONNECTION_FLOW_PATTERNS.disconnect.some((item) => name.includes(item))
      ) {
        if (flowType !== 'error') {
          flowType = 'normal';
        }
      }
    }

    if (flowType === 'normal' && !lastNormalStep) {
      flowType = 'incomplete';
    }

    return {
      phase,
      flowType,
      lastNormalStep,
      errorPoint,
    };
  }

  private findEventClusters<T extends { timestampMs: bigint }>(
    events: T[],
    windowMs: number,
  ): Array<{ events: T[]; windowMs: number }> {
    if (events.length === 0) return [];

    const clusters: Array<{ events: T[]; windowMs: number }> = [];
    let currentCluster: T[] = [events[0]];
    let clusterStart = Number(events[0].timestampMs);

    for (let i = 1; i < events.length; i += 1) {
      const event = events[i];
      const ts = Number(event.timestampMs);

      if (ts - clusterStart <= windowMs) {
        currentCluster.push(event);
      } else {
        if (currentCluster.length >= 2) {
          clusters.push({
            events: currentCluster,
            windowMs:
              Number(currentCluster[currentCluster.length - 1].timestampMs) -
              clusterStart,
          });
        }
        currentCluster = [event];
        clusterStart = ts;
      }
    }

    if (currentCluster.length >= 2) {
      clusters.push({
        events: currentCluster,
        windowMs:
          Number(currentCluster[currentCluster.length - 1].timestampMs) -
          clusterStart,
      });
    }

    return clusters;
  }

  private getMostFrequent(values: string[]): string {
    const counts = new Map<string, number>();
    for (const value of values) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    let max = 0;
    let result = 'unknown';
    for (const [key, count] of counts) {
      if (count > max) {
        max = count;
        result = key;
      }
    }
    return result;
  }

  private generateRecommendations(
    anomalies: Array<{
      type: AnomalyType;
      severity: number;
      suggestion: string;
    }>,
  ): string[] {
    const recommendations: string[] = [];

    if (anomalies.length === 0) {
      return ['No significant issues detected. System is operating normally.'];
    }

    const critical = anomalies.filter((anomaly) => anomaly.severity >= 5);
    if (critical.length > 0) {
      recommendations.push(
        'CRITICAL: Immediate attention required for high-severity issues.',
      );
    }

    const types = new Set(anomalies.map((anomaly) => anomaly.type));

    if (
      types.has(AnomalyType.frequent_disconnect) &&
      types.has(AnomalyType.timeout_retry)
    ) {
      recommendations.push(
        'Multiple connection stability issues detected. Consider checking:',
      );
      recommendations.push('  - Device battery level');
      recommendations.push('  - Signal interference sources');
      recommendations.push('  - Distance between device and phone');
    }

    if (types.has(AnomalyType.command_failure)) {
      recommendations.push(
        'High command failure rate suggests communication issues:',
      );
      recommendations.push('  - Verify command format and parameters');
      recommendations.push('  - Check device firmware version compatibility');
    }

    if (types.has(AnomalyType.slow_connection)) {
      recommendations.push('Slow connection times may indicate:');
      recommendations.push('  - Bluetooth adapter issues');
      recommendations.push('  - Too many paired devices');
      recommendations.push('  - Device discovery delays');
    }

    return recommendations;
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
