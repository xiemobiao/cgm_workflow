import { Injectable } from '@nestjs/common';
import {
  ArtifactType,
  GateStatus,
  RequirementStatus,
  StageName,
  StageStatus,
  WorkflowStatus,
} from '@prisma/client';
import { ApiException } from '../common/api-exception';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RbacService } from '../rbac/rbac.service';
import type { RoleName } from '../rbac/rbac.service';
import { STAGE_ORDER, stageIndex } from './stage.constants';

function deriveRequirementStatus(params: {
  currentStage: StageName;
  releaseGateApproved: boolean;
}): RequirementStatus {
  if (
    params.currentStage === StageName.Requirement ||
    params.currentStage === StageName.Design ||
    params.currentStage === StageName.Development
  ) {
    return RequirementStatus.in_progress;
  }
  if (params.currentStage === StageName.Test) return RequirementStatus.testing;
  if (
    params.currentStage === StageName.Release ||
    params.currentStage === StageName.Diagnosis
  ) {
    return params.releaseGateApproved
      ? RequirementStatus.done
      : RequirementStatus.in_progress;
  }
  return RequirementStatus.in_progress;
}

@Injectable()
export class WorkflowsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
    private readonly audit: AuditService,
  ) {}

  async list(params: { actorUserId: string; projectId: string }) {
    await this.rbac.requireProjectRoles({
      userId: params.actorUserId,
      projectId: params.projectId,
      allowed: ['Admin', 'PM', 'Dev', 'QA', 'Release', 'Support', 'Viewer'],
    });

    const workflows = await this.prisma.workflowInstance.findMany({
      where: { projectId: params.projectId },
      include: {
        requirement: true,
        stages: { include: { gate: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return workflows.map((w) => {
      const currentStage = w.stages.find(
        (s) => s.status === StageStatus.in_progress,
      );
      return {
        id: w.id,
        projectId: w.projectId,
        requirementId: w.requirementId,
        status: w.status,
        currentStage: currentStage?.stageName ?? null,
        requirementTitle: w.requirement.title,
        updatedAt: w.updatedAt.toISOString(),
      };
    });
  }

  async getDetail(params: { actorUserId: string; id: string }) {
    const workflow = await this.prisma.workflowInstance.findUnique({
      where: { id: params.id },
      include: {
        requirement: true,
        stages: { include: { gate: true }, orderBy: { createdAt: 'asc' } },
        artifacts: true,
      },
    });
    if (!workflow) {
      throw new ApiException({
        code: 'WORKFLOW_NOT_FOUND',
        message: 'Workflow not found',
        status: 404,
      });
    }

    await this.rbac.requireProjectRoles({
      userId: params.actorUserId,
      projectId: workflow.projectId,
      allowed: ['Admin', 'PM', 'Dev', 'QA', 'Release', 'Support', 'Viewer'],
    });

    return {
      id: workflow.id,
      projectId: workflow.projectId,
      requirement: {
        id: workflow.requirement.id,
        externalId: workflow.requirement.externalId,
        title: workflow.requirement.title,
        status: workflow.requirement.status,
        sourceStatus: workflow.requirement.sourceStatus,
      },
      status: workflow.status,
      stages: workflow.stages.map((s) => ({
        id: s.id,
        stageName: s.stageName,
        status: s.status,
        gate: s.gate
          ? {
              id: s.gate.id,
              status: s.gate.status,
              approverId: s.gate.approverId,
              decisionReason: s.gate.decisionReason,
              decidedAt: s.gate.decidedAt?.toISOString() ?? null,
            }
          : null,
      })),
      artifacts: workflow.artifacts.map((a) => ({
        id: a.id,
        type: a.type,
        url: a.url,
        ownerId: a.ownerId,
        createdAt: a.createdAt.toISOString(),
      })),
      updatedAt: workflow.updatedAt.toISOString(),
    };
  }

  async createFromRequirement(params: {
    actorUserId: string;
    projectId: string;
    requirementId: string;
    initialStage?: StageName;
  }) {
    await this.rbac.requireProjectRoles({
      userId: params.actorUserId,
      projectId: params.projectId,
      allowed: ['Admin', 'PM', 'Dev', 'QA'],
    });

    const requirement = await this.prisma.requirement.findUnique({
      where: { id: params.requirementId },
    });
    if (!requirement || requirement.projectId !== params.projectId) {
      throw new ApiException({
        code: 'REQUIREMENT_NOT_FOUND',
        message: 'Requirement not found',
        status: 404,
      });
    }

    const existing = await this.prisma.workflowInstance.findFirst({
      where: { requirementId: requirement.id },
    });
    if (existing) return existing;

    const currentStage = params.initialStage ?? StageName.Requirement;
    const currentIndex = stageIndex(currentStage);
    if (currentIndex === -1) {
      throw new ApiException({
        code: 'INVALID_STAGE_VALUE',
        message: 'Invalid stage value',
        status: 400,
      });
    }

    const workflow = await this.prisma.workflowInstance.create({
      data: {
        projectId: params.projectId,
        requirementId: requirement.id,
        status: WorkflowStatus.active,
      },
    });

    const stageInstances = await this.prisma.$transaction(
      STAGE_ORDER.map((stageName, idx) =>
        this.prisma.stageInstance.create({
          data: {
            workflowId: workflow.id,
            stageName,
            status:
              idx < currentIndex
                ? StageStatus.done
                : idx === currentIndex
                  ? StageStatus.in_progress
                  : StageStatus.pending,
          },
        }),
      ),
    );

    await this.prisma.$transaction(
      stageInstances.map((stage, idx) =>
        this.prisma.gate.create({
          data: {
            stageInstanceId: stage.id,
            status:
              idx < currentIndex ? GateStatus.approved : GateStatus.pending,
            decidedAt: idx < currentIndex ? new Date() : null,
          },
        }),
      ),
    );

    const releaseStage = stageInstances.find(
      (s) => s.stageName === StageName.Release,
    );
    const releaseGateApproved =
      releaseStage && stageIndex(currentStage) > stageIndex(StageName.Release);

    await this.prisma.requirement.update({
      where: { id: requirement.id },
      data: {
        status: deriveRequirementStatus({
          currentStage,
          releaseGateApproved: Boolean(releaseGateApproved),
        }),
      },
    });

    await this.audit.record({
      projectId: workflow.projectId,
      actorUserId: params.actorUserId,
      action: 'workflow.create',
      targetType: 'WorkflowInstance',
      targetId: workflow.id,
      metadata: { requirementId: requirement.id },
    });

    return workflow;
  }

  async advanceFromSync(params: {
    actorUserId: string;
    workflowId: string;
    targetStage: StageName;
    integrationId: string;
    sourceStatus: string;
  }) {
    const workflow = await this.prisma.workflowInstance.findUnique({
      where: { id: params.workflowId },
      include: { stages: { include: { gate: true } } },
    });
    if (!workflow) {
      throw new ApiException({
        code: 'WORKFLOW_NOT_FOUND',
        message: 'Workflow not found',
        status: 404,
      });
    }

    await this.rbac.requireProjectRoles({
      userId: params.actorUserId,
      projectId: workflow.projectId,
      allowed: ['Admin', 'PM'],
    });

    const targetIdx = stageIndex(params.targetStage);
    if (targetIdx < 0) {
      throw new ApiException({
        code: 'INVALID_STAGE_VALUE',
        message: 'Invalid stage value',
        status: 400,
      });
    }

    const currentStage = workflow.stages.find(
      (s) => s.status === StageStatus.in_progress,
    );
    if (!currentStage) {
      throw new ApiException({
        code: 'WORKFLOW_STAGE_INVALID',
        message: 'Workflow has no in-progress stage',
        status: 500,
      });
    }

    const currentIdx = stageIndex(currentStage.stageName);
    if (currentIdx < 0) {
      throw new ApiException({
        code: 'WORKFLOW_STAGE_INVALID',
        message: 'Workflow current stage is invalid',
        status: 500,
      });
    }

    if (targetIdx <= currentIdx) {
      if (targetIdx < currentIdx) {
        await this.audit.record({
          projectId: workflow.projectId,
          actorUserId: params.actorUserId,
          action: 'workflow.sync.backward_ignored',
          targetType: 'WorkflowInstance',
          targetId: workflow.id,
          metadata: {
            fromStage: currentStage.stageName,
            toStage: params.targetStage,
            integrationId: params.integrationId,
            sourceStatus: params.sourceStatus,
          },
        });
      }
      return { advanced: false };
    }

    const now = new Date();
    const stagesSorted = [...workflow.stages].sort(
      (a, b) => stageIndex(a.stageName) - stageIndex(b.stageName),
    );

    const beforeStageIds = stagesSorted
      .filter((s) => stageIndex(s.stageName) < targetIdx)
      .map((s) => s.id);
    const afterStageIds = stagesSorted
      .filter((s) => stageIndex(s.stageName) > targetIdx)
      .map((s) => s.id);
    const targetStageInstance = stagesSorted.find(
      (s) => s.stageName === params.targetStage,
    );
    if (!targetStageInstance) {
      throw new ApiException({
        code: 'WORKFLOW_STAGE_INVALID',
        message: 'Target stage instance not found',
        status: 500,
      });
    }

    await this.prisma.$transaction(async (tx) => {
      if (beforeStageIds.length > 0) {
        await tx.stageInstance.updateMany({
          where: { id: { in: beforeStageIds } },
          data: { status: StageStatus.done },
        });
        await tx.gate.updateMany({
          where: {
            stageInstanceId: { in: beforeStageIds },
            status: GateStatus.pending,
          },
          data: {
            status: GateStatus.approved,
            decidedAt: now,
            decisionReason: 'synced from external status',
          },
        });
      }

      await tx.stageInstance.update({
        where: { id: targetStageInstance.id },
        data: { status: StageStatus.in_progress },
      });

      if (afterStageIds.length > 0) {
        await tx.stageInstance.updateMany({
          where: { id: { in: afterStageIds } },
          data: { status: StageStatus.pending },
        });
      }
    });

    const stages = await this.prisma.stageInstance.findMany({
      where: { workflowId: workflow.id },
      include: { gate: true },
    });
    const newCurrentStage =
      stages.find((s) => s.status === StageStatus.in_progress)?.stageName ??
      params.targetStage;
    const releaseGate = stages.find(
      (s) => s.stageName === StageName.Release,
    )?.gate;
    const releaseGateApproved =
      releaseGate?.status === GateStatus.approved ||
      releaseGate?.status === GateStatus.overridden;

    await this.prisma.requirement.update({
      where: { id: workflow.requirementId },
      data: {
        status: deriveRequirementStatus({
          currentStage: newCurrentStage,
          releaseGateApproved: Boolean(releaseGateApproved),
        }),
      },
    });

    await this.audit.record({
      projectId: workflow.projectId,
      actorUserId: params.actorUserId,
      action: 'workflow.sync.advance',
      targetType: 'WorkflowInstance',
      targetId: workflow.id,
      metadata: {
        fromStage: currentStage.stageName,
        toStage: params.targetStage,
        integrationId: params.integrationId,
        sourceStatus: params.sourceStatus,
      },
    });

    return { advanced: true };
  }

  async updateStatus(params: {
    actorUserId: string;
    id: string;
    status: WorkflowStatus;
  }) {
    const workflow = await this.prisma.workflowInstance.findUnique({
      where: { id: params.id },
    });
    if (!workflow) {
      throw new ApiException({
        code: 'WORKFLOW_NOT_FOUND',
        message: 'Workflow not found',
        status: 404,
      });
    }

    await this.rbac.requireProjectRoles({
      userId: params.actorUserId,
      projectId: workflow.projectId,
      allowed: ['Admin', 'PM', 'Dev', 'QA'],
    });

    const updated = await this.prisma.workflowInstance.update({
      where: { id: workflow.id },
      data: { status: params.status },
    });

    await this.audit.record({
      projectId: workflow.projectId,
      actorUserId: params.actorUserId,
      action: 'workflow.status.update',
      targetType: 'WorkflowInstance',
      targetId: workflow.id,
      metadata: { status: updated.status },
    });

    return updated;
  }

  async attachArtifact(params: {
    actorUserId: string;
    workflowId: string;
    type: ArtifactType;
    url: string;
  }) {
    const workflow = await this.prisma.workflowInstance.findUnique({
      where: { id: params.workflowId },
    });
    if (!workflow) {
      throw new ApiException({
        code: 'WORKFLOW_NOT_FOUND',
        message: 'Workflow not found',
        status: 404,
      });
    }

    await this.rbac.requireProjectRoles({
      userId: params.actorUserId,
      projectId: workflow.projectId,
      allowed: ['Admin', 'PM', 'Dev', 'QA'],
    });

    const artifact = await this.prisma.artifact.create({
      data: {
        workflowId: workflow.id,
        type: params.type,
        url: params.url,
        ownerId: params.actorUserId,
      },
    });

    await this.audit.record({
      projectId: workflow.projectId,
      actorUserId: params.actorUserId,
      action: 'artifact.create',
      targetType: 'Artifact',
      targetId: artifact.id,
      metadata: { workflowId: workflow.id, type: artifact.type },
    });

    return artifact;
  }

  async decideGate(params: {
    actorUserId: string;
    workflowId: string;
    gateId: string;
    decision: 'approve' | 'override';
    reason?: string;
  }) {
    const gate = await this.prisma.gate.findUnique({
      where: { id: params.gateId },
      include: { stage: { include: { workflow: true } } },
    });
    if (!gate || gate.stage.workflow.id !== params.workflowId) {
      throw new ApiException({
        code: 'GATE_NOT_FOUND',
        message: 'Gate not found',
        status: 404,
      });
    }

    const workflow = gate.stage.workflow;

    if (gate.status !== GateStatus.pending) {
      throw new ApiException({
        code: 'GATE_ALREADY_DECIDED',
        message: 'Gate already decided',
        status: 400,
      });
    }

    const allowed: RoleName[] =
      params.decision === 'approve'
        ? ['Admin', 'QA', 'Release']
        : ['Admin', 'Release'];
    await this.rbac.requireProjectRoles({
      userId: params.actorUserId,
      projectId: workflow.projectId,
      allowed,
    });

    if (params.decision === 'override' && !params.reason) {
      throw new ApiException({
        code: 'GATE_OVERRIDE_REASON_REQUIRED',
        message: 'Override reason is required',
        status: 400,
      });
    }

    const updatedGate = await this.prisma.gate.update({
      where: { id: gate.id },
      data: {
        status:
          params.decision === 'approve'
            ? GateStatus.approved
            : GateStatus.overridden,
        approverId: params.actorUserId,
        decisionReason: params.reason ?? null,
        decidedAt: new Date(),
      },
    });

    await this.prisma.stageInstance.update({
      where: { id: gate.stageInstanceId },
      data: { status: StageStatus.done },
    });

    const currentIdx = stageIndex(gate.stage.stageName);
    const nextStageName = STAGE_ORDER[currentIdx + 1];

    if (nextStageName) {
      const nextStage = await this.prisma.stageInstance.findFirst({
        where: { workflowId: workflow.id, stageName: nextStageName },
      });
      if (nextStage && nextStage.status === StageStatus.pending) {
        await this.prisma.stageInstance.update({
          where: { id: nextStage.id },
          data: { status: StageStatus.in_progress },
        });
      }
    } else {
      await this.prisma.workflowInstance.update({
        where: { id: workflow.id },
        data: { status: WorkflowStatus.done },
      });
    }

    const stages = await this.prisma.stageInstance.findMany({
      where: { workflowId: workflow.id },
      include: { gate: true },
    });
    const currentStage =
      stages.find((s) => s.status === StageStatus.in_progress)?.stageName ??
      StageName.Diagnosis;
    const releaseGate = stages.find(
      (s) => s.stageName === StageName.Release,
    )?.gate;
    const releaseGateApproved =
      releaseGate?.status === GateStatus.approved ||
      releaseGate?.status === GateStatus.overridden;

    await this.prisma.requirement.update({
      where: { id: workflow.requirementId },
      data: {
        status: deriveRequirementStatus({
          currentStage,
          releaseGateApproved: Boolean(releaseGateApproved),
        }),
      },
    });

    await this.audit.record({
      projectId: workflow.projectId,
      actorUserId: params.actorUserId,
      action: params.decision === 'approve' ? 'gate.approve' : 'gate.override',
      targetType: 'Gate',
      targetId: updatedGate.id,
      metadata: { workflowId: workflow.id, stage: gate.stage.stageName },
    });

    return updatedGate;
  }
}
