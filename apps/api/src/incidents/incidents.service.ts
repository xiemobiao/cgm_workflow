import { Injectable } from '@nestjs/common';
import { IncidentSeverity, IncidentStatus } from '@prisma/client';
import { ApiException } from '../common/api-exception';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';
import { RbacService } from '../rbac/rbac.service';

@Injectable()
export class IncidentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
    private readonly audit: AuditService,
  ) {}

  async list(params: { actorUserId: string; projectId: string }) {
    await this.rbac.requireProjectRoles({
      userId: params.actorUserId,
      projectId: params.projectId,
      allowed: ['Admin', 'Support'],
    });

    const incidents = await this.prisma.incident.findMany({
      where: { projectId: params.projectId, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
      include: { links: true },
    });

    return incidents.map((i) => ({
      id: i.id,
      projectId: i.projectId,
      title: i.title,
      severity: i.severity,
      status: i.status,
      startTime: i.startTime.toISOString(),
      endTime: i.endTime?.toISOString() ?? null,
      logEventCount: i.links.length,
      updatedAt: i.updatedAt.toISOString(),
    }));
  }

  async create(params: {
    actorUserId: string;
    projectId: string;
    title: string;
    severity: IncidentSeverity;
    status: IncidentStatus;
    startTime: Date;
    endTime?: Date | null;
    logEventIds?: string[];
  }) {
    await this.rbac.requireProjectRoles({
      userId: params.actorUserId,
      projectId: params.projectId,
      allowed: ['Admin', 'Support'],
    });

    const logEventIds = Array.from(new Set(params.logEventIds ?? []));

    if (logEventIds.length > 0) {
      const count = await this.prisma.logEvent.count({
        where: { id: { in: logEventIds }, projectId: params.projectId },
      });
      if (count !== logEventIds.length) {
        throw new ApiException({
          code: 'INVALID_LOG_EVENT_IDS',
          message: 'Some logEventIds are invalid',
          status: 400,
        });
      }
    }

    const incident = await this.prisma.$transaction(async (tx) => {
      const created = await tx.incident.create({
        data: {
          projectId: params.projectId,
          title: params.title,
          severity: params.severity,
          status: params.status,
          startTime: params.startTime,
          endTime: params.endTime ?? null,
        },
      });

      if (logEventIds.length > 0) {
        await tx.incidentLogLink.createMany({
          data: logEventIds.map((logEventId) => ({
            incidentId: created.id,
            logEventId,
          })),
        });
      }

      return created;
    });

    await this.audit.record({
      projectId: params.projectId,
      actorUserId: params.actorUserId,
      action: 'incident.create',
      targetType: 'Incident',
      targetId: incident.id,
      metadata: { severity: incident.severity, status: incident.status },
    });

    return { id: incident.id, status: incident.status };
  }

  async update(params: {
    actorUserId: string;
    id: string;
    status?: IncidentStatus;
    endTime?: Date | null;
  }) {
    const existing = await this.prisma.incident.findUnique({
      where: { id: params.id },
    });
    if (!existing || existing.deletedAt) {
      throw new ApiException({
        code: 'INCIDENT_NOT_FOUND',
        message: 'Incident not found',
        status: 404,
      });
    }

    await this.rbac.requireProjectRoles({
      userId: params.actorUserId,
      projectId: existing.projectId,
      allowed: ['Admin', 'Support'],
    });

    const updated = await this.prisma.incident.update({
      where: { id: existing.id },
      data: {
        ...(params.status !== undefined ? { status: params.status } : {}),
        ...(params.endTime !== undefined ? { endTime: params.endTime } : {}),
      },
    });

    await this.audit.record({
      projectId: updated.projectId,
      actorUserId: params.actorUserId,
      action: 'incident.update',
      targetType: 'Incident',
      targetId: updated.id,
      metadata: { status: updated.status },
    });

    return { id: updated.id, status: updated.status };
  }
}
