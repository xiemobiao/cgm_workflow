import { Injectable } from '@nestjs/common';
import { Prisma, SessionStatus } from '@prisma/client';
import { ApiException } from '../common/api-exception';
import { PrismaService } from '../database/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import { BluetoothCommandService } from './bluetooth-command.service';
import {
  BLE_PHASE_PATTERNS,
  extractMsgPreview,
  isBleOp,
  matchesPattern,
  normalizeLower,
} from './bluetooth-utils';

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

@Injectable()
export class BluetoothSessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
    private readonly commandService: BluetoothCommandService,
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

    const sessions: Awaited<
      ReturnType<typeof this.prisma.deviceSession.findUnique>
    >[] = [];

    for (const { linkCode } of linkCodes) {
      if (!linkCode) continue;

      // Check if session already exists
      const existing = await this.prisma.deviceSession.findUnique({
        where: {
          projectId_linkCode: { projectId: params.projectId, linkCode },
        },
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
          stage: true,
          op: true,
          result: true,
        },
      });

      if (events.length === 0) continue;

      const sessionData = this.analyzeSessionEvents(events);

      // Upsert session
      const session = await this.prisma.deviceSession.upsert({
        where: {
          projectId_linkCode: { projectId: params.projectId, linkCode },
        },
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
      stage?: string | null;
      op?: string | null;
      result?: string | null;
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
      const result = normalizeLower(event.result);

      // Track phase timestamps
      if (matchesPattern(name, BLE_PHASE_PATTERNS.scan) && !scanStartMs) {
        scanStartMs = event.timestampMs;
        status = SessionStatus.scanning;
      }
      if (matchesPattern(name, BLE_PHASE_PATTERNS.pair) && !pairStartMs) {
        pairStartMs = event.timestampMs;
        status = SessionStatus.pairing;
      }
      if (
        (isBleOp(event, 'connect', 'start') ||
          matchesPattern(name, BLE_PHASE_PATTERNS.connect)) &&
        !connectStartMs
      ) {
        connectStartMs = event.timestampMs;
        status = SessionStatus.connecting;
      } else if (isBleOp(event, 'connect') && !connectStartMs) {
        connectStartMs = event.timestampMs;
        status = SessionStatus.connecting;
      }
      if (
        isBleOp(event, 'connect', 'ok') ||
        matchesPattern(name, BLE_PHASE_PATTERNS.connected)
      ) {
        connectedMs = event.timestampMs;
        status = SessionStatus.connected;
      }
      if (
        isBleOp(event, 'disconnect') ||
        matchesPattern(name, BLE_PHASE_PATTERNS.disconnect)
      ) {
        disconnectMs = event.timestampMs;
        status = SessionStatus.disconnected;
      }

      // Track errors
      const isStructuredConnectFailure =
        isBleOp(event, 'connect') &&
        (result === 'fail' || result === 'timeout');
      if (
        event.level >= 4 ||
        matchesPattern(name, BLE_PHASE_PATTERNS.error) ||
        isStructuredConnectFailure
      ) {
        errorCount++;
        if (name.includes('TIMEOUT') || result === 'timeout') {
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
      startTimeMs && endTimeMs ? Number(endTimeMs - startTimeMs) : null;

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

  private async assertLogFileInProject(params: {
    projectId: string;
    logFileId: string;
  }) {
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
    const endMs = params.endTime
      ? BigInt(new Date(params.endTime).getTime())
      : null;

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
        (
          g,
        ): g is { linkCode: string; startTimeMs: bigint; endTimeMs: bigint } =>
          typeof g.linkCode === 'string' &&
          g.startTimeMs !== null &&
          g.endTimeMs !== null,
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
          stage: true,
          op: true,
          result: true,
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
          stage: e.stage,
          op: e.op,
          result: e.result,
        })),
      );

      const timeline = this.buildSessionTimeline(events);
      const commandChains = this.commandService.buildCommandChains(events);

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
          connectStartMs: meta.connectStartMs
            ? Number(meta.connectStartMs)
            : null,
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
          msg: extractMsgPreview(e.msgJson),
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
        stage: true,
        op: true,
        result: true,
      },
    });

    // Build timeline phases
    const timeline = this.buildSessionTimeline(events);

    // Get command chains
    const commandChains = this.commandService.buildCommandChains(events);

    return {
      session: {
        ...session,
        startTimeMs: Number(session.startTimeMs),
        endTimeMs: session.endTimeMs ? Number(session.endTimeMs) : null,
        scanStartMs: session.scanStartMs ? Number(session.scanStartMs) : null,
        pairStartMs: session.pairStartMs ? Number(session.pairStartMs) : null,
        connectStartMs: session.connectStartMs
          ? Number(session.connectStartMs)
          : null,
        connectedMs: session.connectedMs ? Number(session.connectedMs) : null,
        disconnectMs: session.disconnectMs
          ? Number(session.disconnectMs)
          : null,
      },
      timeline,
      commandChains,
      events: events.map((e) => ({
        id: e.id,
        eventName: e.eventName,
        level: e.level,
        timestampMs: Number(e.timestampMs),
        msg: extractMsgPreview(e.msgJson),
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
      stage?: string | null;
      op?: string | null;
      result?: string | null;
    }>,
  ): SessionTimelinePhase[] {
    const phases: SessionTimelinePhase[] = [];
    let currentPhase: SessionTimelinePhase | null = null;

    // Phase detection logic follows...

    for (const event of events) {
      const name = event.eventName.toUpperCase();
      const result = normalizeLower(event.result);
      let phaseName: string | null = null;

      if (isBleOp(event, 'connect', 'ok')) {
        phaseName = 'connected';
      } else if (isBleOp(event, 'disconnect')) {
        phaseName = 'disconnect';
      } else if (isBleOp(event, 'connect')) {
        phaseName = 'connect';
      } else if (matchesPattern(name, BLE_PHASE_PATTERNS.scan)) {
        phaseName = 'scan';
      } else if (matchesPattern(name, BLE_PHASE_PATTERNS.pair)) {
        phaseName = 'pair';
      } else if (matchesPattern(name, BLE_PHASE_PATTERNS.connect)) {
        phaseName = 'connect';
      } else if (matchesPattern(name, BLE_PHASE_PATTERNS.connected)) {
        phaseName = 'connected';
      } else if (matchesPattern(name, BLE_PHASE_PATTERNS.disconnect)) {
        phaseName = 'disconnect';
      } else if (event.requestId) {
        phaseName = 'communicate';
      }

      // Determine event status
      let eventStatus: 'success' | 'error' | 'timeout' | 'pending' = 'success';
      if (isBleOp(event, 'connect', 'start')) {
        eventStatus = 'pending';
      } else if (isBleOp(event, 'connect') && result === 'timeout') {
        eventStatus = 'timeout';
      } else if (isBleOp(event, 'connect') && result === 'fail') {
        eventStatus = 'error';
      }

      if (
        event.level >= 4 ||
        (event.errorCode && !isBleOp(event, 'disconnect'))
      ) {
        eventStatus =
          name.includes('TIMEOUT') || result === 'timeout'
            ? 'timeout'
            : 'error';
      }

      const eventItem = {
        id: event.id,
        eventName: event.eventName,
        timestampMs: Number(event.timestampMs),
        level: event.level,
        msg: extractMsgPreview(event.msgJson),
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
}
