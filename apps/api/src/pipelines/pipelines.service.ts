import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ApiException } from '../common/api-exception';
import { PrismaService } from '../database/prisma.service';
import { RbacService } from '../rbac/rbac.service';

@Injectable()
export class PipelinesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
  ) {}

  async trigger(params: { actorUserId: string; projectId: string }) {
    await this.rbac.requireProjectRoles({
      userId: params.actorUserId,
      projectId: params.projectId,
      allowed: ['Admin', 'Dev', 'QA', 'Release'],
    });

    const run = await this.prisma.pipelineRun.create({
      data: {
        projectId: params.projectId,
        externalId: `stub-${randomUUID()}`,
        status: 'triggered',
      },
    });

    return { id: run.id, status: run.status, externalId: run.externalId };
  }

  async get(params: { actorUserId: string; id: string }) {
    const run = await this.prisma.pipelineRun.findUnique({
      where: { id: params.id },
    });
    if (!run) {
      throw new ApiException({
        code: 'PIPELINE_NOT_FOUND',
        message: 'Pipeline run not found',
        status: 404,
      });
    }

    await this.rbac.requireProjectRoles({
      userId: params.actorUserId,
      projectId: run.projectId,
      allowed: ['Admin', 'PM', 'Dev', 'QA', 'Release', 'Support', 'Viewer'],
    });

    return {
      id: run.id,
      projectId: run.projectId,
      status: run.status,
      externalId: run.externalId,
      url: run.url,
      updatedAt: run.updatedAt.toISOString(),
    };
  }
}
