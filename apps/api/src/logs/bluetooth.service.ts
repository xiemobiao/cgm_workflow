import { Injectable } from '@nestjs/common';
import { AnomalyType, Prisma, SessionStatus } from '@prisma/client';
import { ApiException } from '../common/api-exception';
import { PrismaService } from '../database/prisma.service';
import { RbacService } from '../rbac/rbac.service';

// Event name patterns for phase detection
const PHASE_PATTERNS = {
  scan: ['SCAN_START', 'SCAN_DEVICE', 'DEVICE_FOUND', 'BLE scan'],
  pair: ['PAIR_START', 'PAIRING', 'BOND', 'BLE pair'],
  connect: ['CONNECT_START', 'CONNECTING', 'GATT_CONNECT', 'BLE connect'],
  connected: ['CONNECTED', 'CONNECTION_SUCCESS', 'GATT_CONNECTED', 'BLE connected'],
  disconnect: ['DISCONNECT', 'DISCONNECTED', 'CONNECTION_LOST', 'BLE disconnect'],
  error: ['ERROR', 'FAILED', 'TIMEOUT', 'Exception'],
};

// Anomaly detection thresholds
const ANOMALY_THRESHOLDS = {
  frequentDisconnect: { count: 3, windowMs: 60000 }, // 3 disconnects in 1 minute
  timeoutRetry: { count: 2, windowMs: 30000 }, // 2 timeouts in 30 seconds
  errorBurst: { count: 5, windowMs: 10000 }, // 5 errors in 10 seconds
  slowConnection: { thresholdMs: 10000 }, // Connection takes more than 10 seconds
  commandFailure: { rate: 0.3 }, // More than 30% command failure rate
};

// Known error patterns for smart analysis
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
    suggestion: 'GATT operation failed. Check Bluetooth connection stability and retry.',
  },
  {
    pattern: /CONNECTION_TIMEOUT|CONNECT_TIMEOUT/i,
    category: 'connection_timeout',
    severity: 3,
    suggestion: 'Connection timeout. Ensure device is in range and not paired with other devices.',
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
    suggestion: 'BLE service/characteristic not found. Check device firmware version.',
  },
  {
    pattern: /WRITE_FAILED|READ_FAILED/i,
    category: 'io_error',
    severity: 3,
    suggestion: 'BLE read/write operation failed. Verify connection is still active.',
  },
  {
    pattern: /DISCONNECTED_UNEXPECTEDLY|CONNECTION_LOST/i,
    category: 'unexpected_disconnect',
    severity: 4,
    suggestion: 'Unexpected disconnection. Check for interference or low battery.',
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
    suggestion: 'Missing permissions. Grant Bluetooth and location permissions.',
  },
];

// Connection flow patterns for context analysis
const CONNECTION_FLOW_PATTERNS = {
  normal: ['SCAN', 'FOUND', 'CONNECT', 'CONNECTED', 'DISCOVER', 'ENABLE', 'WRITE', 'READ'],
  disconnect: ['DISCONNECT', 'DISCONNECTED', 'CLOSE', 'RELEASE'],
  error: ['ERROR', 'FAILED', 'TIMEOUT', 'EXCEPTION'],
};

export interface SessionTimelinePhase {
  name: string;
  startMs: number;
  endMs: number | null;
  status: 'success' | 'error' | 'timeout' | 'pending';
  events: Array<{
    id: string;
    eventName: string;
    timestampMs: number;
    level: number;
    msg: string | null;
  }>;
}

export interface CommandChainStats {
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
}

@Injectable()
export class BluetoothService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
  ) {}

  // Aggregate sessions from log events
  async aggregateSessions(params: {
    actorUserId: string;
    projectId: string;
    startTime: string;
    endTime: string;
    forceRefresh?: boolean;
  }) {
    await this.rbac.requireProjectRoles({
      userId: params.actorUserId,
      projectId: params.projectId,
      allowed: ['Admin', 'PM', 'Dev', 'QA', 'Release', 'Support', 'Viewer'],
    });

    const startMs = BigInt(new Date(params.startTime).getTime());
    const endMs = BigInt(new Date(params.endTime).getTime());

    // Find all unique linkCodes in the time range
    const linkCodes = await this.prisma.logEvent.findMany({
      where: {
        projectId: params.projectId,
        timestampMs: { gte: startMs, lte: endMs },
        linkCode: { not: null },
      },
      select: { linkCode: true },
      distinct: ['linkCode'],
    });

    const sessions: Awaited<ReturnType<typeof this.prisma.deviceSession.findUnique>>[] = [];

    for (const { linkCode } of linkCodes) {
      if (!linkCode) continue;

      // Check if session already exists
      const existing = await this.prisma.deviceSession.findUnique({
        where: { projectId_linkCode: { projectId: params.projectId, linkCode } },
      });

      if (existing && !params.forceRefresh) {
        sessions.push(existing);
        continue;
      }

      // Aggregate session data from events
      const events = await this.prisma.logEvent.findMany({
        where: {
          projectId: params.projectId,
          linkCode,
        },
        orderBy: { timestampMs: 'asc' },
        select: {
          id: true,
          eventName: true,
          level: true,
          timestampMs: true,
          sdkVersion: true,
          appId: true,
          terminalInfo: true,
          deviceMac: true,
          errorCode: true,
          requestId: true,
        },
      });

      if (events.length === 0) continue;

      const sessionData = this.analyzeSessionEvents(events);

      // Upsert session
      const session = await this.prisma.deviceSession.upsert({
        where: { projectId_linkCode: { projectId: params.projectId, linkCode } },
        create: {
          projectId: params.projectId,
          linkCode,
          ...sessionData,
        },
        update: sessionData,
      });

      sessions.push(session);
    }

    return { count: sessions.length, sessions };
  }

  // Analyze events to extract session metadata
  private analyzeSessionEvents(
    events: Array<{
      id: string;
      eventName: string;
      level: number;
      timestampMs: bigint;
      sdkVersion: string | null;
      appId: string | null;
      terminalInfo: string | null;
      deviceMac: string | null;
      errorCode: string | null;
      requestId: string | null;
    }>,
  ) {
    const firstEvent = events[0];
    const lastEvent = events[events.length - 1];

    let status: SessionStatus = SessionStatus.scanning;
    let scanStartMs: bigint | null = null;
    let pairStartMs: bigint | null = null;
    let connectStartMs: bigint | null = null;
    let connectedMs: bigint | null = null;
    let disconnectMs: bigint | null = null;

    let errorCount = 0;
    const requestIds = new Set<string>();
    let deviceMac: string | null = null;

    for (const event of events) {
      const name = event.eventName.toUpperCase();

      // Track phase timestamps
      if (this.matchesPattern(name, PHASE_PATTERNS.scan) && !scanStartMs) {
        scanStartMs = event.timestampMs;
        status = SessionStatus.scanning;
      }
      if (this.matchesPattern(name, PHASE_PATTERNS.pair) && !pairStartMs) {
        pairStartMs = event.timestampMs;
        status = SessionStatus.pairing;
      }
      if (this.matchesPattern(name, PHASE_PATTERNS.connect) && !connectStartMs) {
        connectStartMs = event.timestampMs;
        status = SessionStatus.connecting;
      }
      if (this.matchesPattern(name, PHASE_PATTERNS.connected)) {
        connectedMs = event.timestampMs;
        status = SessionStatus.connected;
      }
      if (this.matchesPattern(name, PHASE_PATTERNS.disconnect)) {
        disconnectMs = event.timestampMs;
        status = SessionStatus.disconnected;
      }

      // Track errors
      if (event.level >= 4 || this.matchesPattern(name, PHASE_PATTERNS.error)) {
        errorCount++;
        if (name.includes('TIMEOUT')) {
          status = SessionStatus.timeout;
        } else if (errorCount > 0 && status !== SessionStatus.disconnected) {
          status = SessionStatus.error;
        }
      }

      // Track device MAC
      if (event.deviceMac && !deviceMac) {
        deviceMac = event.deviceMac;
      }

      // Track request IDs
      if (event.requestId) {
        requestIds.add(event.requestId);
      }
    }

    // If we have communication events after connected, mark as communicating
    if (connectedMs && requestIds.size > 0) {
      status = SessionStatus.communicating;
    }

    const startTimeMs = firstEvent.timestampMs;
    const endTimeMs = lastEvent.timestampMs;
    const durationMs =
      startTimeMs && endTimeMs
        ? Number(endTimeMs - startTimeMs)
        : null;

    return {
      deviceMac,
      startTimeMs,
      endTimeMs,
      durationMs,
      status,
      eventCount: events.length,
      errorCount,
      commandCount: requestIds.size,
      scanStartMs,
      pairStartMs,
      connectStartMs,
      connectedMs,
      disconnectMs,
      sdkVersion: firstEvent.sdkVersion,
      appId: firstEvent.appId,
      terminalInfo: firstEvent.terminalInfo,
    };
  }

  private matchesPattern(eventName: string, patterns: string[]): boolean {
    const upper = eventName.toUpperCase();
    return patterns.some((p) => upper.includes(p.toUpperCase()));
  }

  private async assertLogFileInProject(params: { projectId: string; logFileId: string }) {
    const found = await this.prisma.logFile.findFirst({
      where: { id: params.logFileId, projectId: params.projectId },
      select: { id: true },
    });
    if (!found) {
      throw new ApiException({
        code: 'LOG_FILE_NOT_FOUND',
        message: 'Log file not found',
        status: 404,
      });
    }
  }

  // Get session list with filtering
  async getSessions(params: {
    actorUserId: string;
    projectId: string;
    logFileId?: string;
    startTime?: string;
    endTime?: string;
    deviceMac?: string;
    status?: SessionStatus;
    limit?: number;
    cursor?: string;
  }) {
    await this.rbac.requireProjectRoles({
      userId: params.actorUserId,
      projectId: params.projectId,
      allowed: ['Admin', 'PM', 'Dev', 'QA', 'Release', 'Support', 'Viewer'],
    });

    if (params.logFileId) {
      return this.getSessionsFromLogFile({
        actorUserId: params.actorUserId,
        projectId: params.projectId,
        logFileId: params.logFileId,
        startTime: params.startTime,
        endTime: params.endTime,
        deviceMac: params.deviceMac,
        status: params.status,
        limit: params.limit,
      });
    }

    const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
    const where: Prisma.DeviceSessionWhereInput = {
      projectId: params.projectId,
    };

    if (params.startTime) {
      where.startTimeMs = { gte: BigInt(new Date(params.startTime).getTime()) };
    }
    if (params.endTime) {
      where.endTimeMs = { lte: BigInt(new Date(params.endTime).getTime()) };
    }
    if (params.deviceMac) {
      where.deviceMac = params.deviceMac;
    }
    if (params.status) {
      where.status = params.status;
    }

    const sessions = await this.prisma.deviceSession.findMany({
      where,
      orderBy: { startTimeMs: 'desc' },
      take: limit + 1,
    });

    const hasMore = sessions.length > limit;
    const items = hasMore ? sessions.slice(0, limit) : sessions;

    return {
      items: items.map((s) => ({
        ...s,
        startTimeMs: Number(s.startTimeMs),
        endTimeMs: s.endTimeMs ? Number(s.endTimeMs) : null,
        scanStartMs: s.scanStartMs ? Number(s.scanStartMs) : null,
        pairStartMs: s.pairStartMs ? Number(s.pairStartMs) : null,
        connectStartMs: s.connectStartMs ? Number(s.connectStartMs) : null,
        connectedMs: s.connectedMs ? Number(s.connectedMs) : null,
        disconnectMs: s.disconnectMs ? Number(s.disconnectMs) : null,
      })),
      hasMore,
    };
  }

  private async getSessionsFromLogFile(params: {
    actorUserId: string;
    projectId: string;
    logFileId: string;
    startTime?: string;
    endTime?: string;
    deviceMac?: string;
    status?: SessionStatus;
    limit?: number;
  }) {
    await this.assertLogFileInProject({
      projectId: params.projectId,
      logFileId: params.logFileId,
    });

    const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
    const startMs = params.startTime
      ? BigInt(new Date(params.startTime).getTime())
      : null;
    const endMs = params.endTime ? BigInt(new Date(params.endTime).getTime()) : null;

    const sessionGroups = await this.prisma.logEvent.groupBy({
      by: ['linkCode'],
      where: {
        projectId: params.projectId,
        logFileId: params.logFileId,
        linkCode: { not: null },
      },
      _min: { timestampMs: true },
      _max: { timestampMs: true },
    });

    const sortedLinkCodes = sessionGroups
      .map((g) => ({
        linkCode: g.linkCode,
        startTimeMs: g._min.timestampMs,
        endTimeMs: g._max.timestampMs,
      }))
      .filter(
        (g): g is { linkCode: string; startTimeMs: bigint; endTimeMs: bigint } =>
          typeof g.linkCode === 'string' && g.startTimeMs !== null && g.endTimeMs !== null,
      )
      .filter((g) => {
        if (startMs !== null && g.startTimeMs < startMs) return false;
        if (endMs !== null && g.endTimeMs > endMs) return false;
        return true;
      })
      .sort((a, b) => Number(b.startTimeMs) - Number(a.startTimeMs))
      .map((g) => g.linkCode);

    const batchSize = 50;
    const matched: Array<{
      id: string;
      linkCode: string;
      deviceMac: string | null;
      startTimeMs: number;
      endTimeMs: number | null;
      durationMs: number | null;
      status: SessionStatus;
      eventCount: number;
      errorCount: number;
      commandCount: number;
      sdkVersion: string | null;
      appId: string | null;
    }> = [];

    for (let offset = 0; offset < sortedLinkCodes.length; offset += batchSize) {
      const linkCodes = sortedLinkCodes.slice(offset, offset + batchSize);
      if (linkCodes.length === 0) break;

      const events = await this.prisma.logEvent.findMany({
        where: {
          projectId: params.projectId,
          logFileId: params.logFileId,
          linkCode: { in: linkCodes },
        },
        orderBy: [{ linkCode: 'asc' }, { timestampMs: 'asc' }, { id: 'asc' }],
        select: {
          linkCode: true,
          id: true,
          eventName: true,
          level: true,
          timestampMs: true,
          sdkVersion: true,
          appId: true,
          terminalInfo: true,
          deviceMac: true,
          errorCode: true,
          requestId: true,
        },
      });

      const byLinkCode = new Map<string, typeof events>();
      for (const e of events) {
        if (!e.linkCode) continue;
        const list = byLinkCode.get(e.linkCode);
        if (list) list.push(e);
        else byLinkCode.set(e.linkCode, [e]);
      }

      for (const linkCode of linkCodes) {
        const list = byLinkCode.get(linkCode);
        if (!list || list.length === 0) continue;

        const meta = this.analyzeSessionEvents(list);
        const item = {
          id: `logFile:${params.logFileId}:${linkCode}`,
          linkCode,
          deviceMac: meta.deviceMac,
          startTimeMs: Number(meta.startTimeMs),
          endTimeMs: Number(meta.endTimeMs),
          durationMs: meta.durationMs,
          status: meta.status,
          eventCount: meta.eventCount,
          errorCount: meta.errorCount,
          commandCount: meta.commandCount,
          sdkVersion: meta.sdkVersion,
          appId: meta.appId,
        };

        if (params.deviceMac && item.deviceMac !== params.deviceMac) continue;
        if (params.status && item.status !== params.status) continue;

        matched.push(item);
        if (matched.length > limit) break;
      }

      if (matched.length > limit) break;
    }

    const hasMore = matched.length > limit;
    const items = hasMore ? matched.slice(0, limit) : matched;
    return { items, hasMore };
  }

  // Get session detail with timeline
  async getSessionDetail(params: {
    actorUserId: string;
    projectId: string;
    logFileId?: string;
    linkCode: string;
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

      const events = await this.prisma.logEvent.findMany({
        where: {
          projectId: params.projectId,
          logFileId: params.logFileId,
          linkCode: params.linkCode,
        },
        orderBy: { timestampMs: 'asc' },
        select: {
          id: true,
          eventName: true,
          level: true,
          timestampMs: true,
          msgJson: true,
          requestId: true,
          errorCode: true,
          threadName: true,
          sdkVersion: true,
          appId: true,
          terminalInfo: true,
          deviceMac: true,
        },
      });

      if (events.length === 0) {
        return null;
      }

      const meta = this.analyzeSessionEvents(
        events.map((e) => ({
          id: e.id,
          eventName: e.eventName,
          level: e.level,
          timestampMs: e.timestampMs,
          sdkVersion: e.sdkVersion,
          appId: e.appId,
          terminalInfo: e.terminalInfo,
          deviceMac: e.deviceMac,
          errorCode: e.errorCode,
          requestId: e.requestId,
        })),
      );

      const timeline = this.buildSessionTimeline(events);
      const commandChains = this.extractCommandChains(events);

      return {
        session: {
          id: `logFile:${params.logFileId}:${params.linkCode}`,
          linkCode: params.linkCode,
          deviceMac: meta.deviceMac,
          startTimeMs: Number(meta.startTimeMs),
          endTimeMs: Number(meta.endTimeMs),
          durationMs: meta.durationMs,
          status: meta.status,
          eventCount: meta.eventCount,
          errorCount: meta.errorCount,
          commandCount: meta.commandCount,
          scanStartMs: meta.scanStartMs ? Number(meta.scanStartMs) : null,
          pairStartMs: meta.pairStartMs ? Number(meta.pairStartMs) : null,
          connectStartMs: meta.connectStartMs ? Number(meta.connectStartMs) : null,
          connectedMs: meta.connectedMs ? Number(meta.connectedMs) : null,
          disconnectMs: meta.disconnectMs ? Number(meta.disconnectMs) : null,
          sdkVersion: meta.sdkVersion,
          appId: meta.appId,
          terminalInfo: meta.terminalInfo,
        },
        timeline,
        commandChains,
        events: events.map((e) => ({
          id: e.id,
          eventName: e.eventName,
          level: e.level,
          timestampMs: Number(e.timestampMs),
          msg: this.extractMsgPreview(e.msgJson),
          requestId: e.requestId,
          errorCode: e.errorCode,
          threadName: e.threadName,
        })),
      };
    }

    const session = await this.prisma.deviceSession.findUnique({
      where: {
        projectId_linkCode: {
          projectId: params.projectId,
          linkCode: params.linkCode,
        },
      },
    });

    if (!session) {
      return null;
    }

    // Get all events for this session
    const events = await this.prisma.logEvent.findMany({
      where: {
        projectId: params.projectId,
        linkCode: params.linkCode,
      },
      orderBy: { timestampMs: 'asc' },
      select: {
        id: true,
        eventName: true,
        level: true,
        timestampMs: true,
        msgJson: true,
        requestId: true,
        errorCode: true,
        threadName: true,
      },
    });

    // Build timeline phases
    const timeline = this.buildSessionTimeline(events);

    // Get command chains
    const commandChains = this.extractCommandChains(events);

    return {
      session: {
        ...session,
        startTimeMs: Number(session.startTimeMs),
        endTimeMs: session.endTimeMs ? Number(session.endTimeMs) : null,
        scanStartMs: session.scanStartMs ? Number(session.scanStartMs) : null,
        pairStartMs: session.pairStartMs ? Number(session.pairStartMs) : null,
        connectStartMs: session.connectStartMs ? Number(session.connectStartMs) : null,
        connectedMs: session.connectedMs ? Number(session.connectedMs) : null,
        disconnectMs: session.disconnectMs ? Number(session.disconnectMs) : null,
      },
      timeline,
      commandChains,
      events: events.map((e) => ({
        id: e.id,
        eventName: e.eventName,
        level: e.level,
        timestampMs: Number(e.timestampMs),
        msg: this.extractMsgPreview(e.msgJson),
        requestId: e.requestId,
        errorCode: e.errorCode,
        threadName: e.threadName,
      })),
    };
  }

  private buildSessionTimeline(
    events: Array<{
      id: string;
      eventName: string;
      level: number;
      timestampMs: bigint;
      msgJson: Prisma.JsonValue;
      requestId: string | null;
      errorCode: string | null;
    }>,
  ): SessionTimelinePhase[] {
    const phases: SessionTimelinePhase[] = [];
    let currentPhase: SessionTimelinePhase | null = null;

    const phaseOrder = ['scan', 'pair', 'connect', 'connected', 'communicate', 'disconnect'];

    for (const event of events) {
      const name = event.eventName.toUpperCase();
      let phaseName: string | null = null;

      if (this.matchesPattern(name, PHASE_PATTERNS.scan)) {
        phaseName = 'scan';
      } else if (this.matchesPattern(name, PHASE_PATTERNS.pair)) {
        phaseName = 'pair';
      } else if (this.matchesPattern(name, PHASE_PATTERNS.connect)) {
        phaseName = 'connect';
      } else if (this.matchesPattern(name, PHASE_PATTERNS.connected)) {
        phaseName = 'connected';
      } else if (this.matchesPattern(name, PHASE_PATTERNS.disconnect)) {
        phaseName = 'disconnect';
      } else if (event.requestId) {
        phaseName = 'communicate';
      }

      // Determine event status
      let eventStatus: 'success' | 'error' | 'timeout' | 'pending' = 'success';
      if (event.level >= 4 || event.errorCode) {
        eventStatus = name.includes('TIMEOUT') ? 'timeout' : 'error';
      }

      const eventItem = {
        id: event.id,
        eventName: event.eventName,
        timestampMs: Number(event.timestampMs),
        level: event.level,
        msg: this.extractMsgPreview(event.msgJson),
      };

      if (phaseName && (!currentPhase || currentPhase.name !== phaseName)) {
        // Close previous phase
        if (currentPhase) {
          currentPhase.endMs = Number(event.timestampMs);
          phases.push(currentPhase);
        }

        // Start new phase
        currentPhase = {
          name: phaseName,
          startMs: Number(event.timestampMs),
          endMs: null,
          status: eventStatus,
          events: [eventItem],
        };
      } else if (currentPhase) {
        currentPhase.events.push(eventItem);
        if (eventStatus === 'error' || eventStatus === 'timeout') {
          currentPhase.status = eventStatus;
        }
      }
    }

    // Close last phase
    if (currentPhase) {
      if (events.length > 0) {
        currentPhase.endMs = Number(events[events.length - 1].timestampMs);
      }
      phases.push(currentPhase);
    }

    return phases;
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
        existing.eventCount++;
        existing.events.push({
          id: event.id,
          eventName: event.eventName,
          timestampMs: ts,
          level: event.level,
        });

        // Update status based on event
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

  // Analyze command chains with percentile statistics
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
      events.map((e) => ({ ...e, msgJson: null })),
    );

    // Calculate statistics
    const durations = chains
      .filter((c) => c.durationMs !== null && c.durationMs > 0)
      .map((c) => c.durationMs as number)
      .sort((a, b) => a - b);

    const stats = {
      total: chains.length,
      success: chains.filter((c) => c.status === 'success').length,
      timeout: chains.filter((c) => c.status === 'timeout').length,
      error: chains.filter((c) => c.status === 'error').length,
      pending: chains.filter((c) => c.status === 'pending').length,
      avgDurationMs: durations.length > 0
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : null,
      p50: this.percentile(durations, 50),
      p90: this.percentile(durations, 90),
      p99: this.percentile(durations, 99),
      slowest: chains
        .filter((c) => c.durationMs !== null)
        .sort((a, b) => (b.durationMs ?? 0) - (a.durationMs ?? 0))
        .slice(0, 5)
        .map((c) => ({
          requestId: c.requestId,
          durationMs: c.durationMs,
          status: c.status,
        })),
    };

    return {
      chains: chains.slice(0, limit),
      stats,
    };
  }

  private percentile(sorted: number[], p: number): number | null {
    if (sorted.length === 0) return null;
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
  }

  // Detect anomaly patterns
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
        deviceMac: true,
        errorCode: true,
        sdkVersion: true,
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

    // Detect frequent disconnects
    const disconnectEvents = events.filter((e) =>
      this.matchesPattern(e.eventName, PHASE_PATTERNS.disconnect),
    );
    if (disconnectEvents.length >= ANOMALY_THRESHOLDS.frequentDisconnect.count) {
      const affectedLinkCodes = new Set(
        disconnectEvents.map((e) => e.linkCode).filter(Boolean),
      );
      patterns.push({
        patternType: AnomalyType.frequent_disconnect,
        description: `Detected ${disconnectEvents.length} disconnect events`,
        severity: disconnectEvents.length >= 5 ? 4 : 3,
        occurrenceCount: disconnectEvents.length,
        affectedSessions: affectedLinkCodes.size,
        sampleEventIds: disconnectEvents.slice(0, 5).map((e) => e.id),
        deviceMac: disconnectEvents[0]?.deviceMac ?? null,
        sdkVersion: disconnectEvents[0]?.sdkVersion ?? null,
      });
    }

    // Detect timeout retries
    const timeoutEvents = events.filter(
      (e) =>
        e.eventName.toUpperCase().includes('TIMEOUT') ||
        (e.level >= 4 && e.eventName.toUpperCase().includes('RETRY')),
    );
    if (timeoutEvents.length >= ANOMALY_THRESHOLDS.timeoutRetry.count) {
      const affectedLinkCodes = new Set(
        timeoutEvents.map((e) => e.linkCode).filter(Boolean),
      );
      patterns.push({
        patternType: AnomalyType.timeout_retry,
        description: `Detected ${timeoutEvents.length} timeout/retry events`,
        severity: timeoutEvents.length >= 4 ? 4 : 3,
        occurrenceCount: timeoutEvents.length,
        affectedSessions: affectedLinkCodes.size,
        sampleEventIds: timeoutEvents.slice(0, 5).map((e) => e.id),
        deviceMac: timeoutEvents[0]?.deviceMac ?? null,
        sdkVersion: timeoutEvents[0]?.sdkVersion ?? null,
      });
    }

    // Detect error bursts
    const errorEvents = events.filter((e) => e.level >= 4);
    if (errorEvents.length >= ANOMALY_THRESHOLDS.errorBurst.count) {
      const affectedLinkCodes = new Set(
        errorEvents.map((e) => e.linkCode).filter(Boolean),
      );
      patterns.push({
        patternType: AnomalyType.error_burst,
        description: `Detected ${errorEvents.length} error-level events`,
        severity: errorEvents.length >= 10 ? 5 : 4,
        occurrenceCount: errorEvents.length,
        affectedSessions: affectedLinkCodes.size,
        sampleEventIds: errorEvents.slice(0, 5).map((e) => e.id),
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

  // Get error distribution
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

    // Group by error code
    const byErrorCode = new Map<string, { count: number; lastSeen: number }>();
    for (const event of events) {
      const code = event.errorCode ?? 'UNKNOWN';
      const existing = byErrorCode.get(code);
      const ts = Number(event.timestampMs);
      if (existing) {
        existing.count++;
        existing.lastSeen = Math.max(existing.lastSeen, ts);
      } else {
        byErrorCode.set(code, { count: 1, lastSeen: ts });
      }
    }

    // Group by event name
    const byEventName = new Map<string, { count: number; lastSeen: number }>();
    for (const event of events) {
      const existing = byEventName.get(event.eventName);
      const ts = Number(event.timestampMs);
      if (existing) {
        existing.count++;
        existing.lastSeen = Math.max(existing.lastSeen, ts);
      } else {
        byEventName.set(event.eventName, { count: 1, lastSeen: ts });
      }
    }

    // Group by level
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

  private extractMsgPreview(msgJson: Prisma.JsonValue): string | null {
    if (!msgJson) return null;
    if (typeof msgJson === 'string') return msgJson.slice(0, 200);
    if (typeof msgJson === 'object') {
      try {
        const str = JSON.stringify(msgJson);
        return str.length > 200 ? str.slice(0, 200) + '...' : str;
      } catch {
        return null;
      }
    }
    return String(msgJson).slice(0, 200);
  }

  // Smart error analysis with pattern matching
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

    // Get the target event
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

    // Get context events (before and after)
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

    // Analyze the error pattern
    const errorAnalysis = this.analyzeErrorPattern(targetEvent.eventName, targetEvent.errorCode);

    // Find related events (same linkCode or requestId)
    const relatedEvents = await this.findRelatedEvents(
      params.projectId,
      targetEvent,
      targetEvent.logFileId,
    );

    // Build connection flow context
    const beforeChronological = [...beforeEvents].reverse();
    const flowContext = this.analyzeConnectionFlow(
      [...beforeChronological, targetEvent, ...afterEvents].map((e) => ({
        eventName: e.eventName,
        level: e.level,
      })),
    );

    return {
      event: {
        id: targetEvent.id,
        eventName: targetEvent.eventName,
        level: targetEvent.level,
        timestampMs: Number(targetEvent.timestampMs),
        msg: this.extractMsgPreview(targetEvent.msgJson),
        errorCode: targetEvent.errorCode,
        deviceMac: targetEvent.deviceMac,
        sdkVersion: targetEvent.sdkVersion,
      },
      context: {
        before: beforeChronological.map((e) => ({
          id: e.id,
          eventName: e.eventName,
          level: e.level,
          timestampMs: Number(e.timestampMs),
          msg: this.extractMsgPreview(e.msgJson),
        })),
        after: afterEvents.map((e) => ({
          id: e.id,
          eventName: e.eventName,
          level: e.level,
          timestampMs: Number(e.timestampMs),
          msg: this.extractMsgPreview(e.msgJson),
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

    // Default analysis based on event name
    const name = eventName.toUpperCase();
    let category = 'unknown';
    let severity = 3;
    let suggestion = 'Check device connection and retry the operation.';

    if (name.includes('TIMEOUT')) {
      category = 'timeout';
      severity = 3;
      suggestion = 'Operation timed out. Check device responsiveness and connection quality.';
    } else if (name.includes('ERROR') || name.includes('FAILED')) {
      category = 'general_error';
      severity = 4;
      suggestion = 'An error occurred. Review the message details for more information.';
    } else if (name.includes('DISCONNECT')) {
      category = 'disconnect';
      severity = 3;
      suggestion = 'Device disconnected. Check if this was expected or triggered by an error.';
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

    return related.map((e) => ({
      id: e.id,
      eventName: e.eventName,
      level: e.level,
      timestampMs: Number(e.timestampMs),
      linkCode: e.linkCode,
      requestId: e.requestId,
      errorCode: e.errorCode,
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

      // Check if this is a normal flow step
      for (const step of CONNECTION_FLOW_PATTERNS.normal) {
        if (name.includes(step)) {
          lastNormalStep = step;
          phase = step.toLowerCase();
          break;
        }
      }

      // Check if this is an error
      if (event.level >= 4 || CONNECTION_FLOW_PATTERNS.error.some((e) => name.includes(e))) {
        flowType = 'error';
        errorPoint = event.eventName;
      }

      // Check for disconnect
      if (CONNECTION_FLOW_PATTERNS.disconnect.some((d) => name.includes(d))) {
        if (flowType !== 'error') {
          flowType = 'normal';
        }
      }
    }

    // If we don't have a complete flow, mark as incomplete
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

  // Enhanced anomaly detection with time window analysis
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
        errorCode: true,
        sdkVersion: true,
        msgJson: true,
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

    // 1. Detect frequent disconnects within time windows
    const disconnectClusters = this.findEventClusters(
      events.filter((e) => this.matchesPattern(e.eventName, PHASE_PATTERNS.disconnect)),
      ANOMALY_THRESHOLDS.frequentDisconnect.windowMs,
    );

    for (const cluster of disconnectClusters) {
      if (cluster.events.length >= ANOMALY_THRESHOLDS.frequentDisconnect.count) {
        const affectedSessions = [...new Set(cluster.events.map((e) => e.linkCode).filter(Boolean))] as string[];
        anomalies.push({
          type: AnomalyType.frequent_disconnect,
          severity: cluster.events.length >= 5 ? 5 : 4,
          description: `${cluster.events.length} disconnects in ${Math.round(cluster.windowMs / 1000)}s`,
          suggestion: 'Check for connection stability issues, signal interference, or device battery.',
          occurrences: cluster.events.length,
          affectedSessions,
          timeWindowMs: cluster.windowMs,
          sampleEvents: cluster.events.slice(0, 5).map((e) => ({
            id: e.id,
            eventName: e.eventName,
            timestampMs: Number(e.timestampMs),
          })),
        });
      }
    }

    // 2. Detect timeout retry patterns
    const timeoutEvents = events.filter(
      (e) => e.eventName.toUpperCase().includes('TIMEOUT'),
    );
    const timeoutClusters = this.findEventClusters(
      timeoutEvents,
      ANOMALY_THRESHOLDS.timeoutRetry.windowMs,
    );

    for (const cluster of timeoutClusters) {
      if (cluster.events.length >= ANOMALY_THRESHOLDS.timeoutRetry.count) {
        const affectedSessions = [...new Set(cluster.events.map((e) => e.linkCode).filter(Boolean))] as string[];
        anomalies.push({
          type: AnomalyType.timeout_retry,
          severity: cluster.events.length >= 4 ? 4 : 3,
          description: `${cluster.events.length} timeouts in ${Math.round(cluster.windowMs / 1000)}s`,
          suggestion: 'Device may be unresponsive. Check device status and connection quality.',
          occurrences: cluster.events.length,
          affectedSessions,
          timeWindowMs: cluster.windowMs,
          sampleEvents: cluster.events.slice(0, 5).map((e) => ({
            id: e.id,
            eventName: e.eventName,
            timestampMs: Number(e.timestampMs),
          })),
        });
      }
    }

    // 3. Detect error bursts
    const errorEvents = events.filter((e) => e.level >= 4);
    const errorClusters = this.findEventClusters(
      errorEvents,
      ANOMALY_THRESHOLDS.errorBurst.windowMs,
    );

    for (const cluster of errorClusters) {
      if (cluster.events.length >= ANOMALY_THRESHOLDS.errorBurst.count) {
        const affectedSessions = [...new Set(cluster.events.map((e) => e.linkCode).filter(Boolean))] as string[];

        // Analyze error patterns in the cluster
        const errorCategories = cluster.events.map((e) =>
          this.analyzeErrorPattern(e.eventName, e.errorCode).category
        );
        const topCategory = this.getMostFrequent(errorCategories);

        anomalies.push({
          type: AnomalyType.error_burst,
          severity: cluster.events.length >= 10 ? 5 : 4,
          description: `${cluster.events.length} errors in ${Math.round(cluster.windowMs / 1000)}s (mostly ${topCategory})`,
          suggestion: 'Multiple errors occurred rapidly. Review the error sequence to identify root cause.',
          occurrences: cluster.events.length,
          affectedSessions,
          timeWindowMs: cluster.windowMs,
          sampleEvents: cluster.events.slice(0, 5).map((e) => ({
            id: e.id,
            eventName: e.eventName,
            timestampMs: Number(e.timestampMs),
          })),
        });
      }
    }

    // 4. Detect slow connections
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

    const slowSessions = sessions.filter((s) => {
      if (!s.scanStartMs || !s.connectedMs) return false;
      const connectionTime = Number(s.connectedMs - s.scanStartMs);
      return connectionTime > ANOMALY_THRESHOLDS.slowConnection.thresholdMs;
    });

    if (slowSessions.length > 0) {
      anomalies.push({
        type: AnomalyType.slow_connection,
        severity: slowSessions.length >= 3 ? 4 : 3,
        description: `${slowSessions.length} sessions took >10s to connect`,
        suggestion: 'Connection is slow. Check for interference, device distance, or pairing issues.',
        occurrences: slowSessions.length,
        affectedSessions: slowSessions.map((s) => s.linkCode),
        timeWindowMs: Number(endMs - startMs),
        sampleEvents: [],
      });
    }

    // 5. Detect command failure patterns
    const commandEvents = events.filter((e) => e.eventName.toUpperCase().includes('COMMAND') ||
      e.eventName.toUpperCase().includes('REQUEST') ||
      e.eventName.toUpperCase().includes('WRITE'));

    const failedCommands = commandEvents.filter((e) => e.level >= 4);
    const failureRate = commandEvents.length > 0
      ? failedCommands.length / commandEvents.length
      : 0;

    if (failureRate > ANOMALY_THRESHOLDS.commandFailure.rate && commandEvents.length >= 5) {
      anomalies.push({
        type: AnomalyType.command_failure,
        severity: failureRate > 0.5 ? 5 : 4,
        description: `${Math.round(failureRate * 100)}% command failure rate (${failedCommands.length}/${commandEvents.length})`,
        suggestion: 'High command failure rate. Check device responsiveness and data format.',
        occurrences: failedCommands.length,
        affectedSessions: [...new Set(failedCommands.map((e) => e.linkCode).filter(Boolean))] as string[],
        timeWindowMs: Number(endMs - startMs),
        sampleEvents: failedCommands.slice(0, 5).map((e) => ({
          id: e.id,
          eventName: e.eventName,
          timestampMs: Number(e.timestampMs),
        })),
      });
    }

    // Sort by severity
    anomalies.sort((a, b) => b.severity - a.severity);

    return {
      anomalies,
      summary: {
        totalAnomalies: anomalies.length,
        criticalCount: anomalies.filter((a) => a.severity >= 5).length,
        highCount: anomalies.filter((a) => a.severity === 4).length,
        mediumCount: anomalies.filter((a) => a.severity === 3).length,
        affectedSessionsCount: new Set(anomalies.flatMap((a) => a.affectedSessions)).size,
      },
      recommendations: this.generateRecommendations(anomalies),
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

    for (let i = 1; i < events.length; i++) {
      const event = events[i];
      const ts = Number(event.timestampMs);

      if (ts - clusterStart <= windowMs) {
        currentCluster.push(event);
      } else {
        if (currentCluster.length >= 2) {
          clusters.push({
            events: currentCluster,
            windowMs: Number(currentCluster[currentCluster.length - 1].timestampMs) - clusterStart,
          });
        }
        currentCluster = [event];
        clusterStart = ts;
      }
    }

    if (currentCluster.length >= 2) {
      clusters.push({
        events: currentCluster,
        windowMs: Number(currentCluster[currentCluster.length - 1].timestampMs) - clusterStart,
      });
    }

    return clusters;
  }

  private getMostFrequent(arr: string[]): string {
    const counts = new Map<string, number>();
    for (const item of arr) {
      counts.set(item, (counts.get(item) ?? 0) + 1);
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
    anomalies: Array<{ type: AnomalyType; severity: number; suggestion: string }>,
  ): string[] {
    const recommendations: string[] = [];

    if (anomalies.length === 0) {
      return ['No significant issues detected. System is operating normally.'];
    }

    const critical = anomalies.filter((a) => a.severity >= 5);
    if (critical.length > 0) {
      recommendations.push('CRITICAL: Immediate attention required for high-severity issues.');
    }

    const types = new Set(anomalies.map((a) => a.type));

    if (types.has(AnomalyType.frequent_disconnect) && types.has(AnomalyType.timeout_retry)) {
      recommendations.push('Multiple connection stability issues detected. Consider checking:');
      recommendations.push('  - Device battery level');
      recommendations.push('  - Signal interference sources');
      recommendations.push('  - Distance between device and phone');
    }

    if (types.has(AnomalyType.command_failure)) {
      recommendations.push('High command failure rate suggests communication issues:');
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
}
