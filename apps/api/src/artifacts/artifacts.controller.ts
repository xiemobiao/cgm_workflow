import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ArtifactType } from '@prisma/client';
import { z } from 'zod';
import { CurrentUser } from '../auth/current-user.decorator';
import type { CurrentUserPayload } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkflowsService } from '../workflows/workflows.service';

const createSchema = z.object({
  workflowId: z.string().uuid(),
  type: z.nativeEnum(ArtifactType),
  url: z.string().url(),
});

@UseGuards(JwtAuthGuard)
@Controller('artifacts')
export class ArtifactsController {
  constructor(private readonly workflows: WorkflowsService) {}

  @Post()
  @HttpCode(200)
  async create(@CurrentUser() user: CurrentUserPayload, @Body() body: unknown) {
    const dto = createSchema.parse(body);
    return this.workflows.attachArtifact({
      actorUserId: user.userId,
      workflowId: dto.workflowId,
      type: dto.type,
      url: dto.url,
    });
  }
}
