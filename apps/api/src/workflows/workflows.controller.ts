import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { StageName, WorkflowStatus } from '@prisma/client';
import { z } from 'zod';
import { CurrentUser } from '../auth/current-user.decorator';
import type { CurrentUserPayload } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkflowsService } from './workflows.service';

const listSchema = z.object({
  projectId: z.string().uuid(),
});

const createSchema = z.object({
  projectId: z.string().uuid(),
  requirementId: z.string().uuid(),
  initialStage: z.nativeEnum(StageName).optional(),
});

const updateStatusSchema = z.object({
  status: z.nativeEnum(WorkflowStatus),
});

@UseGuards(JwtAuthGuard)
@Controller('workflows')
export class WorkflowsController {
  constructor(private readonly workflows: WorkflowsService) {}

  @Get()
  async list(@CurrentUser() user: CurrentUserPayload, @Query() query: unknown) {
    const dto = listSchema.parse(query);
    return this.workflows.list({
      actorUserId: user.userId,
      projectId: dto.projectId,
    });
  }

  @Get(':id')
  async detail(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    return this.workflows.getDetail({ actorUserId: user.userId, id });
  }

  @Post()
  @HttpCode(200)
  async create(@CurrentUser() user: CurrentUserPayload, @Body() body: unknown) {
    const dto = createSchema.parse(body);
    return this.workflows.createFromRequirement({
      actorUserId: user.userId,
      ...dto,
    });
  }

  @Patch(':id/status')
  async updateStatus(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const dto = updateStatusSchema.parse(body);
    return this.workflows.updateStatus({
      actorUserId: user.userId,
      id,
      status: dto.status,
    });
  }
}
