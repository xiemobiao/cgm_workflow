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
import { IncidentSeverity, IncidentStatus } from '@prisma/client';
import { z } from 'zod';
import { CurrentUser } from '../auth/current-user.decorator';
import type { CurrentUserPayload } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { IncidentsService } from './incidents.service';

const listSchema = z.object({
  projectId: z.string().uuid(),
});

const createSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(1),
  severity: z.nativeEnum(IncidentSeverity),
  status: z.nativeEnum(IncidentStatus).default(IncidentStatus.open),
  startTime: z.string().datetime(),
  endTime: z.string().datetime().optional(),
  logEventIds: z.array(z.string().uuid()).optional(),
});

const updateSchema = z.object({
  status: z.nativeEnum(IncidentStatus).optional(),
  endTime: z.string().datetime().nullable().optional(),
});

@UseGuards(JwtAuthGuard)
@Controller('incidents')
export class IncidentsController {
  constructor(private readonly incidents: IncidentsService) {}

  @Get()
  async list(@CurrentUser() user: CurrentUserPayload, @Query() query: unknown) {
    const dto = listSchema.parse(query);
    return this.incidents.list({
      actorUserId: user.userId,
      projectId: dto.projectId,
    });
  }

  @Post()
  @HttpCode(200)
  async create(@CurrentUser() user: CurrentUserPayload, @Body() body: unknown) {
    const dto = createSchema.parse(body);
    return this.incidents.create({
      actorUserId: user.userId,
      projectId: dto.projectId,
      title: dto.title,
      severity: dto.severity,
      status: dto.status,
      startTime: new Date(dto.startTime),
      endTime: dto.endTime ? new Date(dto.endTime) : null,
      logEventIds: dto.logEventIds,
    });
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const dto = updateSchema.parse(body);
    return this.incidents.update({
      actorUserId: user.userId,
      id,
      status: dto.status,
      endTime:
        dto.endTime === undefined
          ? undefined
          : dto.endTime
            ? new Date(dto.endTime)
            : null,
    });
  }
}
