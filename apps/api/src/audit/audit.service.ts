import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(params: {
    projectId: string;
    actorUserId?: string | null;
    action: string;
    targetType: string;
    targetId?: string | null;
    metadata?: unknown;
  }) {
    await this.prisma.auditLog.create({
      data: {
        projectId: params.projectId,
        actorUserId: params.actorUserId ?? null,
        action: params.action,
        targetType: params.targetType,
        targetId: params.targetId ?? null,
        metadata: params.metadata ?? undefined,
      },
    });
  }
}
