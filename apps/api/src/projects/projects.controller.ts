import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ProjectStatus, ProjectType } from '@prisma/client';
import { z } from 'zod';
import { CurrentUser } from '../auth/current-user.decorator';
import type { CurrentUserPayload } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RoleName } from '../rbac/rbac.service';
import { ProjectsService } from './projects.service';

const createProjectSchema = z.object({
  name: z.string().min(1),
  type: z.nativeEnum(ProjectType),
  status: z.nativeEnum(ProjectStatus).default(ProjectStatus.active),
});

const addMemberSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(['Admin', 'PM', 'Dev', 'QA', 'Release', 'Support', 'Viewer']),
});

@UseGuards(JwtAuthGuard)
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  async list(@CurrentUser() user: CurrentUserPayload) {
    return this.projects.listForUser(user.userId);
  }

  @Post()
  @HttpCode(200)
  async create(@CurrentUser() user: CurrentUserPayload, @Body() body: unknown) {
    const dto = createProjectSchema.parse(body);
    return this.projects.createProject({
      actorUserId: user.userId,
      name: dto.name,
      type: dto.type,
      status: dto.status,
    });
  }

  @Get(':id/members')
  async members(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') projectId: string,
  ) {
    return this.projects.listMembers(user.userId, projectId);
  }

  @Post(':id/members')
  @HttpCode(200)
  async addMember(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') projectId: string,
    @Body() body: unknown,
  ) {
    const dto = addMemberSchema.parse(body);
    return this.projects.addMember({
      actorUserId: user.userId,
      projectId,
      userId: dto.userId,
      roleName: dto.role as RoleName,
    });
  }
}
