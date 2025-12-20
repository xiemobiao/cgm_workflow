import { Injectable } from '@nestjs/common';
import { Prisma, RequirementStatus, StageName } from '@prisma/client';
import { ApiException } from '../common/api-exception';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import { IntegrationsService } from '../integrations/integrations.service';
import { integrationMappingSchema } from '../integrations/mapping.schema';
import { WorkflowsService } from '../workflows/workflows.service';

function getValue(obj: unknown, key: string): unknown {
  if (!obj || typeof obj !== 'object') return undefined;
  return (obj as Record<string, unknown>)[key];
}

function getString(obj: unknown, key: string): string | undefined {
  const v = getValue(obj, key);
  if (v === undefined || v === null) return undefined;
  if (typeof v === 'string') return v;
  if (
    typeof v === 'number' ||
    typeof v === 'boolean' ||
    typeof v === 'bigint'
  ) {
    return String(v);
  }
  return undefined;
}

function getStringArray(obj: unknown, key: string): string[] | undefined {
  const v = getValue(obj, key);
  if (v === undefined || v === null) return undefined;
  if (Array.isArray(v)) {
    return v
      .map((x) =>
        typeof x === 'string'
          ? x
          : typeof x === 'number' ||
              typeof x === 'boolean' ||
              typeof x === 'bigint'
            ? String(x)
            : undefined,
      )
      .filter((x): x is string => Boolean(x));
  }
  if (typeof v === 'string') {
    return v
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (
    typeof v === 'number' ||
    typeof v === 'boolean' ||
    typeof v === 'bigint'
  ) {
    return [String(v)];
  }
  return undefined;
}

@Injectable()
export class RequirementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
    private readonly audit: AuditService,
    private readonly integrations: IntegrationsService,
    private readonly workflows: WorkflowsService,
  ) {}

  async list(params: { actorUserId: string; projectId: string }) {
    await this.rbac.requireProjectRoles({
      userId: params.actorUserId,
      projectId: params.projectId,
      allowed: ['Admin', 'PM', 'Dev', 'QA', 'Release', 'Support', 'Viewer'],
    });

    const requirements = await this.prisma.requirement.findMany({
      where: { projectId: params.projectId, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
      include: { workflows: true },
    });

    return requirements.map((r) => ({
      id: r.id,
      projectId: r.projectId,
      externalId: r.externalId,
      title: r.title,
      status: r.status,
      source: r.source,
      sourceStatus: r.sourceStatus,
      owner: r.owner,
      priority: r.priority,
      tags: r.tags,
      hasWorkflow: r.workflows.length > 0,
      updatedAt: r.updatedAt.toISOString(),
    }));
  }

  async sync(params: {
    actorUserId: string;
    projectId: string;
    integrationId: string;
    items?: unknown[];
  }) {
    await this.rbac.requireProjectRoles({
      userId: params.actorUserId,
      projectId: params.projectId,
      allowed: ['Admin', 'PM'],
    });

    const integration = await this.integrations.getForSync({
      actorUserId: params.actorUserId,
      id: params.integrationId,
    });

    if (integration.projectId !== params.projectId) {
      throw new ApiException({
        code: 'INTEGRATION_PROJECT_MISMATCH',
        message: 'Integration does not belong to project',
        status: 400,
      });
    }

    if (!integration.mapping) {
      throw new ApiException({
        code: 'INVALID_MAPPING_REQUIRED_FIELDS',
        message: 'Integration mapping is required before sync',
        status: 400,
      });
    }

    const mappingParsed = integrationMappingSchema.safeParse(
      integration.mapping,
    );
    if (!mappingParsed.success) {
      const issue = mappingParsed.error.issues?.[0];
      throw new ApiException({
        code: 'INVALID_MAPPING',
        message: issue?.message ?? 'Integration mapping is invalid',
        status: 400,
      });
    }
    const mapping = mappingParsed.data;

    const items = params.items ?? [
      {
        id: 'REQ-1',
        title: 'MVP sample requirement',
        status: 'In Progress',
        type: 'Requirement',
        priority: 'P1',
        owner: 'alice',
        tags: ['CGM'],
      },
    ];

    let synced = 0;
    let createdWorkflows = 0;

    for (const item of items) {
      const externalId = getString(item, mapping.fieldMap.external_id);
      const title = getString(item, mapping.fieldMap.title);
      const sourceStatus = getString(item, mapping.fieldMap.status);
      const type = mapping.fieldMap.type
        ? getString(item, mapping.fieldMap.type)
        : undefined;
      const priority = mapping.fieldMap.priority
        ? getString(item, mapping.fieldMap.priority)
        : undefined;
      const owner = mapping.fieldMap.owner
        ? getString(item, mapping.fieldMap.owner)
        : undefined;
      const tags = mapping.fieldMap.tags
        ? getStringArray(item, mapping.fieldMap.tags)
        : undefined;

      if (!externalId || !title || !sourceStatus) continue;

      const typeOk = type?.includes(mapping.filters.typeContains) ?? false;
      const tagOk =
        !mapping.filters.tagContains ||
        (tags ?? []).some((t) => t.includes(mapping.filters.tagContains ?? ''));
      if (!typeOk || !tagOk) continue;

      const mappedStage: StageName | undefined =
        mapping.statusMap[sourceStatus];

      const requirement = await this.prisma.requirement.upsert({
        where: {
          projectId_externalId: { projectId: params.projectId, externalId },
        },
        update: {
          title,
          sourceStatus,
          owner,
          priority,
          tags: tags as unknown as Prisma.InputJsonValue,
        },
        create: {
          projectId: params.projectId,
          externalId,
          title,
          status: RequirementStatus.draft,
          source: String(integration.type),
          sourceStatus,
          owner,
          priority,
          tags: tags as unknown as Prisma.InputJsonValue,
        },
      });
      synced += 1;

      const existingWorkflow = await this.prisma.workflowInstance.findFirst({
        where: { requirementId: requirement.id },
      });

      if (!mappedStage) {
        await this.audit.record({
          projectId: params.projectId,
          actorUserId: params.actorUserId,
          action: 'requirements.sync.unknown_status',
          targetType: 'Requirement',
          targetId: requirement.id,
          metadata: {
            externalId,
            sourceStatus,
            integrationId: integration.id,
          },
        });
        continue;
      }

      if (!existingWorkflow) {
        await this.workflows.createFromRequirement({
          actorUserId: params.actorUserId,
          projectId: params.projectId,
          requirementId: requirement.id,
          initialStage: mappedStage,
        });
        createdWorkflows += 1;
      } else {
        await this.workflows.advanceFromSync({
          actorUserId: params.actorUserId,
          workflowId: existingWorkflow.id,
          targetStage: mappedStage,
          integrationId: integration.id,
          sourceStatus,
        });
      }
    }

    return { synced, createdWorkflows };
  }
}
