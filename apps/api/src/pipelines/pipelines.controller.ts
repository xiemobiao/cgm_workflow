import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../auth/current-user.decorator';
import type { CurrentUserPayload } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PipelinesService } from './pipelines.service';

const triggerSchema = z.object({
  projectId: z.string().uuid(),
});

@UseGuards(JwtAuthGuard)
@Controller('pipelines')
export class PipelinesController {
  constructor(private readonly pipelines: PipelinesService) {}

  @Post('trigger')
  @HttpCode(200)
  async trigger(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: unknown,
  ) {
    const dto = triggerSchema.parse(body);
    return this.pipelines.trigger({
      actorUserId: user.userId,
      projectId: dto.projectId,
    });
  }

  @Get(':id')
  async get(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.pipelines.get({ actorUserId: user.userId, id });
  }
}
