import {
  Body,
  Controller,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../auth/current-user.decorator';
import type { CurrentUserPayload } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkflowsService } from './workflows.service';

const approveSchema = z.object({
  reason: z.string().min(1).optional(),
});

const overrideSchema = z.object({
  reason: z.string().min(1),
});

@UseGuards(JwtAuthGuard)
@Controller('workflows/:workflowId/gates')
export class GatesController {
  constructor(private readonly workflows: WorkflowsService) {}

  @Post(':gateId/approve')
  @HttpCode(200)
  async approve(
    @CurrentUser() user: CurrentUserPayload,
    @Param('workflowId') workflowId: string,
    @Param('gateId') gateId: string,
    @Body() body: unknown,
  ) {
    const dto = approveSchema.parse(body ?? {});
    return this.workflows.decideGate({
      actorUserId: user.userId,
      workflowId,
      gateId,
      decision: 'approve',
      reason: dto.reason,
    });
  }

  @Post(':gateId/override')
  @HttpCode(200)
  async override(
    @CurrentUser() user: CurrentUserPayload,
    @Param('workflowId') workflowId: string,
    @Param('gateId') gateId: string,
    @Body() body: unknown,
  ) {
    const dto = overrideSchema.parse(body);
    return this.workflows.decideGate({
      actorUserId: user.userId,
      workflowId,
      gateId,
      decision: 'override',
      reason: dto.reason,
    });
  }
}
