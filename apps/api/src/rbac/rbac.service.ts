import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { ApiException } from '../common/api-exception';

export type RoleName =
  | 'Admin'
  | 'PM'
  | 'Dev'
  | 'QA'
  | 'Release'
  | 'Support'
  | 'Viewer';

@Injectable()
export class RbacService {
  constructor(private readonly prisma: PrismaService) {}

  async requireSystemAdmin(userId: string) {
    const membership = await this.prisma.projectMember.findFirst({
      where: { userId, role: { name: 'Admin' } },
    });
    if (!membership) {
      throw new ApiException({
        code: 'FORBIDDEN_ADMIN_ONLY',
        message: 'Admin only',
        status: 403,
      });
    }
  }

  async getUserRoleInProject(
    userId: string,
    projectId: string,
  ): Promise<RoleName | null> {
    const membership = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
      include: { role: true },
    });
    return (membership?.role?.name as RoleName | undefined) ?? null;
  }

  async requireProjectRoles(params: {
    userId: string;
    projectId: string;
    allowed: RoleName[];
    errorCode?: string;
  }): Promise<RoleName> {
    const role = await this.getUserRoleInProject(
      params.userId,
      params.projectId,
    );
    if (!role) {
      throw new ApiException({
        code: params.errorCode ?? 'FORBIDDEN_PROJECT_ACCESS',
        message: 'No access to project',
        status: 403,
      });
    }

    if (!params.allowed.includes(role)) {
      throw new ApiException({
        code: params.errorCode ?? 'FORBIDDEN_ROLE',
        message: 'Insufficient role',
        status: 403,
      });
    }

    return role;
  }
}
