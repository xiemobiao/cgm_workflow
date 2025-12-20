import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ProjectType } from '@prisma/client';
import { z } from 'zod';
import { CurrentUser } from '../auth/current-user.decorator';
import type { CurrentUserPayload } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TemplatesService } from './templates.service';

const listSchema = z.object({
  projectId: z.string().uuid(),
});

const createSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().min(1),
  projectType: z.nativeEnum(ProjectType),
  definition: z.unknown(),
});

@UseGuards(JwtAuthGuard)
@Controller('templates')
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  @Get()
  async list(@CurrentUser() user: CurrentUserPayload, @Query() query: unknown) {
    const { projectId } = listSchema.parse(query);
    return this.templates.list({ actorUserId: user.userId, projectId });
  }

  @Post()
  @HttpCode(200)
  async create(@CurrentUser() user: CurrentUserPayload, @Body() body: unknown) {
    const dto = createSchema.parse(body);
    return this.templates.create({ actorUserId: user.userId, ...dto });
  }
}
