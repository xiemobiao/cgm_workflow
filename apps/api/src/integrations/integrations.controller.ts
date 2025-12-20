import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { IntegrationStatus, IntegrationType } from '@prisma/client';
import { z } from 'zod';
import { CurrentUser } from '../auth/current-user.decorator';
import type { CurrentUserPayload } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { integrationMappingSchema } from './mapping.schema';
import { IntegrationsService } from './integrations.service';

const createSchema = z.object({
  projectId: z.string().uuid(),
  type: z.nativeEnum(IntegrationType),
  secretsRef: z.string().default(''),
});

const updateSchema = z.object({
  status: z.nativeEnum(IntegrationStatus),
  secretsRef: z.string().default(''),
});

@UseGuards(JwtAuthGuard)
@Controller('integrations')
export class IntegrationsController {
  constructor(private readonly integrations: IntegrationsService) {}

  @Post()
  @HttpCode(200)
  async create(@CurrentUser() user: CurrentUserPayload, @Body() body: unknown) {
    const dto = createSchema.parse(body);
    return this.integrations.create({ actorUserId: user.userId, ...dto });
  }

  @Get(':id')
  async get(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.integrations.get({ actorUserId: user.userId, id });
  }

  @Put(':id')
  async update(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const dto = updateSchema.parse(body);
    return this.integrations.update({ actorUserId: user.userId, id, ...dto });
  }

  @Put(':id/mapping')
  async updateMapping(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const mapping = integrationMappingSchema.parse(body);
    return this.integrations.updateMapping({
      actorUserId: user.userId,
      id,
      mapping,
    });
  }
}
