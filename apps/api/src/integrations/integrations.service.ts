import { Injectable } from '@nestjs/common';
import { IntegrationStatus, IntegrationType, Prisma } from '@prisma/client';
import { ApiException } from '../common/api-exception';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RbacService } from '../rbac/rbac.service';
import { IntegrationMapping, integrationMappingSchema } from './mapping.schema';

@Injectable()
export class IntegrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
    private readonly audit: AuditService,
  ) {}

  async create(params: {
    actorUserId: string;
    projectId: string;
    type: IntegrationType;
    secretsRef: string;
  }) {
    await this.rbac.requireProjectRoles({
      userId: params.actorUserId,
      projectId: params.projectId,
      allowed: ['Admin'],
    });

    const integration = await this.prisma.integrationConfig.upsert({
      where: {
        projectId_type: { projectId: params.projectId, type: params.type },
      },
      update: {
        status: IntegrationStatus.enabled,
        secretsRef: params.secretsRef,
        lastError: null,
      },
      create: {
        projectId: params.projectId,
        type: params.type,
        status: IntegrationStatus.enabled,
        secretsRef: params.secretsRef,
        createdBy: params.actorUserId,
      },
    });

    await this.audit.record({
      projectId: params.projectId,
      actorUserId: params.actorUserId,
      action: 'integration.create_or_enable',
      targetType: 'IntegrationConfig',
      targetId: integration.id,
      metadata: { type: params.type },
    });

    return integration;
  }

  async get(params: { actorUserId: string; id: string }) {
    const integration = await this.prisma.integrationConfig.findUnique({
      where: { id: params.id },
    });
    if (!integration) {
      throw new ApiException({
        code: 'INTEGRATION_NOT_FOUND',
        message: 'Integration not found',
        status: 404,
      });
    }

    await this.rbac.requireProjectRoles({
      userId: params.actorUserId,
      projectId: integration.projectId,
      allowed: ['Admin'],
    });

    return integration;
  }

  async getForSync(params: { actorUserId: string; id: string }) {
    const integration = await this.prisma.integrationConfig.findUnique({
      where: { id: params.id },
    });
    if (!integration) {
      throw new ApiException({
        code: 'INTEGRATION_NOT_FOUND',
        message: 'Integration not found',
        status: 404,
      });
    }

    await this.rbac.requireProjectRoles({
      userId: params.actorUserId,
      projectId: integration.projectId,
      allowed: ['Admin', 'PM'],
    });

    return integration;
  }

  async update(params: {
    actorUserId: string;
    id: string;
    status: IntegrationStatus;
    secretsRef: string;
  }) {
    const existing = await this.get({
      actorUserId: params.actorUserId,
      id: params.id,
    });

    const integration = await this.prisma.integrationConfig.update({
      where: { id: existing.id },
      data: {
        status: params.status,
        secretsRef: params.secretsRef,
      },
    });

    await this.audit.record({
      projectId: integration.projectId,
      actorUserId: params.actorUserId,
      action: 'integration.update',
      targetType: 'IntegrationConfig',
      targetId: integration.id,
      metadata: { status: integration.status },
    });

    return integration;
  }

  async updateMapping(params: {
    actorUserId: string;
    id: string;
    mapping: IntegrationMapping;
  }) {
    const integration = await this.get({
      actorUserId: params.actorUserId,
      id: params.id,
    });

    const parsed = integrationMappingSchema.safeParse(params.mapping);
    if (!parsed.success) {
      const issue = parsed.error.issues?.[0];
      const path = issue?.path?.join('.') ?? '';
      let code = 'VALIDATION_ERROR';
      if (
        path === 'fieldMap.external_id' ||
        path === 'fieldMap.title' ||
        path === 'fieldMap.status'
      ) {
        code = 'INVALID_MAPPING_REQUIRED_FIELDS';
      } else if (path === 'statusMap') {
        code = 'INVALID_STATUS_MAP_EMPTY';
      } else if (path.startsWith('statusMap.')) {
        code = 'INVALID_STAGE_VALUE';
      } else if (path.startsWith('filters.')) {
        code = 'INVALID_FILTERS';
      }
      throw new ApiException({
        code,
        message: issue?.message ?? 'Invalid mapping',
        status: 400,
      });
    }

    const updated = await this.prisma.integrationConfig.update({
      where: { id: integration.id },
      data: { mapping: parsed.data as unknown as Prisma.InputJsonValue },
    });

    await this.audit.record({
      projectId: updated.projectId,
      actorUserId: params.actorUserId,
      action: 'integration.mapping.update',
      targetType: 'IntegrationConfig',
      targetId: updated.id,
      metadata: { type: updated.type },
    });

    return {
      integrationId: updated.id,
      mapping: updated.mapping,
      updatedAt: updated.updatedAt.toISOString(),
    };
  }
}
