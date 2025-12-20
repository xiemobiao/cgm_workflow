import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../auth/current-user.decorator';
import type { CurrentUserPayload } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequirementsService } from './requirements.service';

const listSchema = z.object({
  projectId: z.string().uuid(),
});

const syncSchema = z.object({
  projectId: z.string().uuid(),
  integrationId: z.string().uuid(),
  items: z.array(z.unknown()).optional(),
});

@UseGuards(JwtAuthGuard)
@Controller()
export class RequirementsController {
  constructor(private readonly requirements: RequirementsService) {}

  @Get('requirements')
  async list(@CurrentUser() user: CurrentUserPayload, @Query() query: unknown) {
    const dto = listSchema.parse(query);
    return this.requirements.list({
      actorUserId: user.userId,
      projectId: dto.projectId,
    });
  }

  @Post('requirements/sync')
  @HttpCode(200)
  async sync(@CurrentUser() user: CurrentUserPayload, @Body() body: unknown) {
    const dto = syncSchema.parse(body);
    return this.requirements.sync({ actorUserId: user.userId, ...dto });
  }
}
