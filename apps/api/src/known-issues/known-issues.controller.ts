import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IssueCategory, ReportType } from '@prisma/client';
import { z } from 'zod';
import { ApiException } from '../common/api-exception';
import { CurrentUser } from '../auth/current-user.decorator';
import type { CurrentUserPayload } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { KnownIssuesService } from './known-issues.service';

const createIssueSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().min(1),
  solution: z.string().min(1),
  category: z.nativeEnum(IssueCategory).optional(),
  severity: z.number().int().min(1).max(5).optional(),
  errorCode: z.string().min(1).optional(),
  eventPattern: z.string().min(1).optional(),
  msgPattern: z.string().min(1).optional(),
});

const updateIssueSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().min(1).optional(),
  solution: z.string().min(1).optional(),
  category: z.nativeEnum(IssueCategory).optional(),
  severity: z.number().int().min(1).max(5).optional(),
  errorCode: z.string().min(1).optional(),
  eventPattern: z.string().min(1).optional(),
  msgPattern: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
});

const listIssuesSchema = z.object({
  projectId: z.string().uuid(),
  category: z.nativeEnum(IssueCategory).optional(),
  isActive: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const matchEventSchema = z.object({
  projectId: z.string().uuid(),
  eventName: z.string().min(1),
  errorCode: z.string().min(1).optional(),
  msg: z.string().optional(),
});

const matchBatchSchema = z.object({
  projectId: z.string().uuid(),
  events: z.array(
    z.object({
      id: z.string(),
      eventName: z.string().min(1),
      errorCode: z.string().optional(),
      msg: z.string().optional(),
    }),
  ).min(1).max(100),
});

const generateReportSchema = z.object({
  projectId: z.string().uuid(),
  reportType: z.nativeEnum(ReportType),
  title: z.string().min(1).max(200).optional(),
  linkCode: z.string().min(1).optional(),
  deviceMac: z.string().min(1).optional(),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
});

const listReportsSchema = z.object({
  projectId: z.string().uuid(),
  reportType: z.nativeEnum(ReportType).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const getReportSchema = z.object({
  projectId: z.string().uuid(),
});

const compareSessionsSchema = z.object({
  projectId: z.string().uuid(),
  sessionA: z.object({
    linkCode: z.string().min(1).optional(),
    deviceMac: z.string().min(1).optional(),
    startTime: z.string().datetime().optional(),
    endTime: z.string().datetime().optional(),
  }),
  sessionB: z.object({
    linkCode: z.string().min(1).optional(),
    deviceMac: z.string().min(1).optional(),
    startTime: z.string().datetime().optional(),
    endTime: z.string().datetime().optional(),
  }),
});

const idSchema = z.string().uuid();

@UseGuards(JwtAuthGuard)
@Controller('known-issues')
export class KnownIssuesController {
  constructor(private readonly service: KnownIssuesService) {}

  @Post()
  async create(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: unknown,
  ) {
    const dto = createIssueSchema.parse(body);
    return this.service.create({
      actorUserId: user.userId,
      ...dto,
    });
  }

  @Get()
  async list(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: unknown,
  ) {
    const dto = listIssuesSchema.parse(query);
    return this.service.list({
      actorUserId: user.userId,
      ...dto,
    });
  }

  @Get(':id')
  async getById(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Query('projectId') projectId: string,
  ) {
    const issueId = idSchema.parse(id);
    const projId = idSchema.parse(projectId);
    const result = await this.service.getById({
      actorUserId: user.userId,
      projectId: projId,
      id: issueId,
    });
    if (!result) {
      throw new ApiException({
        code: 'ISSUE_NOT_FOUND',
        message: 'Known issue not found',
        status: 404,
      });
    }
    return result;
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Query('projectId') projectId: string,
    @Body() body: unknown,
  ) {
    const issueId = idSchema.parse(id);
    const projId = idSchema.parse(projectId);
    const dto = updateIssueSchema.parse(body);
    return this.service.update({
      actorUserId: user.userId,
      projectId: projId,
      id: issueId,
      ...dto,
    });
  }

  @Delete(':id')
  async delete(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Query('projectId') projectId: string,
  ) {
    const issueId = idSchema.parse(id);
    const projId = idSchema.parse(projectId);
    return this.service.delete({
      actorUserId: user.userId,
      projectId: projId,
      id: issueId,
    });
  }

  @Post('match')
  @HttpCode(200)
  async matchEvent(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: unknown,
  ) {
    const dto = matchEventSchema.parse(body);
    return this.service.matchEvent({
      actorUserId: user.userId,
      ...dto,
    });
  }

  @Post('match-batch')
  @HttpCode(200)
  async matchBatch(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: unknown,
  ) {
    const dto = matchBatchSchema.parse(body);
    return this.service.matchBatch({
      actorUserId: user.userId,
      ...dto,
    });
  }
}

@UseGuards(JwtAuthGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly service: KnownIssuesService) {}

  @Post('generate')
  @HttpCode(200)
  async generate(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: unknown,
  ) {
    const dto = generateReportSchema.parse(body);
    return this.service.generateReport({
      actorUserId: user.userId,
      ...dto,
    });
  }

  @Get()
  async list(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: unknown,
  ) {
    const dto = listReportsSchema.parse(query);
    return this.service.listReports({
      actorUserId: user.userId,
      ...dto,
    });
  }

  @Get(':id')
  async getById(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Query() query: unknown,
  ) {
    const reportId = idSchema.parse(id);
    const dto = getReportSchema.parse(query);
    const result = await this.service.getReport({
      actorUserId: user.userId,
      projectId: dto.projectId,
      id: reportId,
    });
    if (!result) {
      throw new ApiException({
        code: 'REPORT_NOT_FOUND',
        message: 'Report not found',
        status: 404,
      });
    }
    return result;
  }

  @Get(':id/export')
  async export(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Query() query: unknown,
  ) {
    const reportId = idSchema.parse(id);
    const dto = getReportSchema.parse(query);
    const result = await this.service.exportReportAsMarkdown({
      actorUserId: user.userId,
      projectId: dto.projectId,
      id: reportId,
    });
    if (!result) {
      throw new ApiException({
        code: 'REPORT_NOT_FOUND',
        message: 'Report not found',
        status: 404,
      });
    }
    return result;
  }

  @Post('compare')
  @HttpCode(200)
  async compare(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: unknown,
  ) {
    const dto = compareSessionsSchema.parse(body);
    return this.service.compareSessions({
      actorUserId: user.userId,
      ...dto,
    });
  }
}
