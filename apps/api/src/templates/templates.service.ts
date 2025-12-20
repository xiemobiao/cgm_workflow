import { Injectable } from '@nestjs/common';
import { Prisma, ProjectType } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { RbacService } from '../rbac/rbac.service';

@Injectable()
export class TemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
  ) {}

  async list(params: { actorUserId: string; projectId: string }) {
    await this.rbac.requireProjectRoles({
      userId: params.actorUserId,
      projectId: params.projectId,
      allowed: ['Admin', 'PM', 'Dev', 'QA', 'Release', 'Support', 'Viewer'],
    });

    const templates = await this.prisma.workflowTemplate.findMany({
      where: { projectId: params.projectId },
      orderBy: { updatedAt: 'desc' },
    });

    return templates.map((t) => ({
      id: t.id,
      projectId: t.projectId,
      name: t.name,
      projectType: t.projectType,
      definition: t.definition,
      updatedAt: t.updatedAt.toISOString(),
    }));
  }

  async create(params: {
    actorUserId: string;
    projectId: string;
    name: string;
    projectType: ProjectType;
    definition: unknown;
  }) {
    await this.rbac.requireProjectRoles({
      userId: params.actorUserId,
      projectId: params.projectId,
      allowed: ['Admin'],
    });

    const template = await this.prisma.workflowTemplate.create({
      data: {
        projectId: params.projectId,
        name: params.name,
        projectType: params.projectType,
        definition: params.definition as Prisma.InputJsonValue,
      },
    });

    return {
      id: template.id,
      projectId: template.projectId,
      name: template.name,
      projectType: template.projectType,
      definition: template.definition,
      updatedAt: template.updatedAt.toISOString(),
    };
  }
}
