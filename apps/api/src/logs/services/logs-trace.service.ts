import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { RbacService } from '../../rbac/rbac.service';
import { LogsHelperService } from './logs-helper.service';

/**
 * Service for tracing log events by linkCode, requestId, deviceMac, deviceSn.
 */
@Injectable()
export class LogsTraceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
    private readonly helper: LogsHelperService,
  ) {}

  async traceByLinkCode(params: {
    actorUserId: string;
    projectId: string;
    logFileId?: string;
    linkCode: string;
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

    const limit = Math.min(Math.max(params.limit ?? 500, 1), 2000);

    const events = await this.prisma.logEvent.findMany({
      where: {
        projectId: params.projectId,
        ...(params.logFileId ? { logFileId: params.logFileId } : {}),
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
        deviceSn: true,
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
        deviceSn: e.deviceSn,
        requestId: e.requestId,
        errorCode: e.errorCode,
        msg: this.helper.msgPreviewFromJson(e.msgJson),
      })),
    };
  }

  async traceByRequestId(params: {
    actorUserId: string;
    projectId: string;
    logFileId?: string;
    requestId: string;
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

    const events = await this.prisma.logEvent.findMany({
      where: {
        projectId: params.projectId,
        ...(params.logFileId ? { logFileId: params.logFileId } : {}),
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
        deviceSn: true,
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
        deviceSn: e.deviceSn,
        errorCode: e.errorCode,
        msg: this.helper.msgPreviewFromJson(e.msgJson),
      })),
    };
  }

  async traceByDeviceMac(params: {
    actorUserId: string;
    projectId: string;
    logFileId?: string;
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

    if (params.logFileId) {
      await this.helper.assertLogFileInProject({
        projectId: params.projectId,
        logFileId: params.logFileId,
      });
    }

    const startMs = BigInt(new Date(params.startTime).getTime());
    const endMs = BigInt(new Date(params.endTime).getTime());
    const limit = Math.min(Math.max(params.limit ?? 500, 1), 2000);

    const events = await this.prisma.logEvent.findMany({
      where: {
        projectId: params.projectId,
        ...(params.logFileId ? { logFileId: params.logFileId } : {}),
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
        deviceSn: true,
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
        deviceSn: e.deviceSn,
        errorCode: e.errorCode,
        msg: this.helper.msgPreviewFromJson(e.msgJson),
      })),
    };
  }

  async traceByDeviceSn(params: {
    actorUserId: string;
    projectId: string;
    logFileId?: string;
    deviceSn: string;
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
    const limit = Math.min(Math.max(params.limit ?? 500, 1), 2000);

    const events = await this.prisma.logEvent.findMany({
      where: {
        projectId: params.projectId,
        ...(params.logFileId ? { logFileId: params.logFileId } : {}),
        deviceSn: params.deviceSn,
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
        deviceMac: true,
        errorCode: true,
      },
    });

    return {
      deviceSn: params.deviceSn,
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
        deviceMac: e.deviceMac,
        deviceSn: params.deviceSn,
        errorCode: e.errorCode,
        msg: this.helper.msgPreviewFromJson(e.msgJson),
      })),
    };
  }

  async getLinkCodeDevices(params: {
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
      await this.helper.assertLogFileInProject({
        projectId: params.projectId,
        logFileId: params.logFileId,
      });
    }

    const devices = await this.prisma.logEvent.groupBy({
      by: ['deviceMac'],
      where: {
        projectId: params.projectId,
        ...(params.logFileId ? { logFileId: params.logFileId } : {}),
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
    logFileId?: string;
    deviceMac: string;
    startTime: string;
    endTime: string;
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

    const sessions = await this.prisma.logEvent.groupBy({
      by: ['linkCode'],
      where: {
        projectId: params.projectId,
        ...(params.logFileId ? { logFileId: params.logFileId } : {}),
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
