import { Injectable } from '@nestjs/common';
import { ProjectStatus, ProjectType } from '@prisma/client';
import { ApiException } from '../common/api-exception';
import { PrismaService } from '../database/prisma.service';
import { RbacService, RoleName } from '../rbac/rbac.service';

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
  ) {}

  async listForUser(userId: string) {
    const memberships = await this.prisma.projectMember.findMany({
      where: { userId },
      include: { project: true, role: true },
      orderBy: { createdAt: 'desc' },
    });

    return memberships.map((m) => ({
      id: m.project.id,
      name: m.project.name,
      type: m.project.type,
      status: m.project.status,
      role: m.role.name as RoleName,
    }));
  }

  async createProject(params: {
    actorUserId: string;
    name: string;
    type: ProjectType;
    status: ProjectStatus;
  }) {
    await this.rbac.requireSystemAdmin(params.actorUserId);

    const adminRole = await this.prisma.role.findUnique({
      where: { name: 'Admin' },
    });
    if (!adminRole) {
      throw new ApiException({
        code: 'ROLE_ADMIN_MISSING',
        message: 'Admin role not found. Run db:seed first.',
        status: 500,
      });
    }

    const project = await this.prisma.project.create({
      data: { name: params.name, type: params.type, status: params.status },
    });

    await this.prisma.projectMember.create({
      data: {
        projectId: project.id,
        userId: params.actorUserId,
        roleId: adminRole.id,
      },
    });

    return project;
  }

  async updateProject(params: {
    actorUserId: string;
    projectId: string;
    name?: string;
    status?: ProjectStatus;
  }) {
    await this.rbac.requireProjectRoles({
      userId: params.actorUserId,
      projectId: params.projectId,
      allowed: ['Admin'],
    });

    const existing = await this.prisma.project.findUnique({
      where: { id: params.projectId },
      select: { id: true },
    });
    if (!existing) {
      throw new ApiException({
        code: 'PROJECT_NOT_FOUND',
        message: 'Project not found',
        status: 404,
      });
    }

    const data: { name?: string; status?: ProjectStatus } = {};
    if (params.name !== undefined) data.name = params.name;
    if (params.status !== undefined) data.status = params.status;

    return this.prisma.project.update({
      where: { id: params.projectId },
      data,
    });
  }

  async addMember(params: {
    actorUserId: string;
    projectId: string;
    userId?: string;
    email?: string;
    roleName: RoleName;
  }) {
    await this.rbac.requireProjectRoles({
      userId: params.actorUserId,
      projectId: params.projectId,
      allowed: ['Admin'],
    });

    const role = await this.prisma.role.findUnique({
      where: { name: params.roleName },
    });
    if (!role) {
      throw new ApiException({
        code: 'ROLE_NOT_FOUND',
        message: 'Role not found',
        status: 400,
      });
    }

    let targetUser: { id: string; email: string; name: string } | null = null;
    if (params.userId) {
      targetUser = await this.prisma.user.findUnique({
        where: { id: params.userId },
        select: { id: true, email: true, name: true },
      });
    } else if (params.email) {
      const email = params.email.trim();
      targetUser = await this.prisma.user.findUnique({
        where: { email },
        select: { id: true, email: true, name: true },
      });
    }

    const targetUserId = targetUser?.id;
    if (!targetUserId) {
      throw new ApiException({
        code: 'USER_NOT_FOUND',
        message: 'User not found',
        status: 400,
      });
    }

    const existing = await this.prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId: params.projectId,
          userId: targetUserId,
        },
      },
      include: { role: true },
    });

    if (existing?.role?.name === 'Admin' && params.roleName !== 'Admin') {
      const adminCount = await this.prisma.projectMember.count({
        where: { projectId: params.projectId, role: { name: 'Admin' } },
      });
      if (adminCount <= 1) {
        throw new ApiException({
          code: 'PROJECT_LAST_ADMIN',
          message: 'Cannot remove the last Admin from the project',
          status: 400,
        });
      }
    }

    const membership = await this.prisma.projectMember.upsert({
      where: {
        projectId_userId: {
          projectId: params.projectId,
          userId: targetUserId,
        },
      },
      update: { roleId: role.id },
      create: {
        projectId: params.projectId,
        userId: targetUserId,
        roleId: role.id,
      },
      include: { role: true, user: true },
    });

    return {
      userId: membership.user.id,
      email: membership.user.email,
      name: membership.user.name,
      role: membership.role.name,
    };
  }

  async removeMember(params: {
    actorUserId: string;
    projectId: string;
    userId: string;
  }) {
    await this.rbac.requireProjectRoles({
      userId: params.actorUserId,
      projectId: params.projectId,
      allowed: ['Admin'],
    });

    const existing = await this.prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId: params.projectId,
          userId: params.userId,
        },
      },
      include: { role: true },
    });
    if (!existing) {
      throw new ApiException({
        code: 'PROJECT_MEMBER_NOT_FOUND',
        message: 'Project member not found',
        status: 404,
      });
    }

    if (existing.role?.name === 'Admin') {
      const adminCount = await this.prisma.projectMember.count({
        where: { projectId: params.projectId, role: { name: 'Admin' } },
      });
      if (adminCount <= 1) {
        throw new ApiException({
          code: 'PROJECT_LAST_ADMIN',
          message: 'Cannot remove the last Admin from the project',
          status: 400,
        });
      }
    }

    await this.prisma.projectMember.delete({
      where: {
        projectId_userId: {
          projectId: params.projectId,
          userId: params.userId,
        },
      },
    });

    return { removed: true };
  }

  async listMembers(actorUserId: string, projectId: string) {
    await this.rbac.requireProjectRoles({
      userId: actorUserId,
      projectId,
      allowed: ['Admin', 'PM', 'Dev', 'QA', 'Release', 'Support', 'Viewer'],
    });

    const memberships = await this.prisma.projectMember.findMany({
      where: { projectId },
      include: { user: true, role: true },
      orderBy: { createdAt: 'asc' },
    });

    return memberships.map((m) => ({
      userId: m.user.id,
      email: m.user.email,
      name: m.user.name,
      role: m.role.name,
      createdAt: m.createdAt.toISOString(),
    }));
  }
}
