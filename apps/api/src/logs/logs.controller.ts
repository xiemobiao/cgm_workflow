import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { z } from 'zod';
import { ApiException } from '../common/api-exception';
import { CurrentUser } from '../auth/current-user.decorator';
import type { CurrentUserPayload } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LogsService } from './logs.service';

const uploadSchema = z.object({
  projectId: z.string().uuid(),
  fileName: z.string().min(1).optional(),
});

const searchSchema = z.object({
  projectId: z.string().uuid(),
  eventName: z.string().min(1).optional(),
  logFileId: z.string().uuid().optional(),
  q: z.string().min(1).optional(),
  direction: z.enum(['asc', 'desc']).optional(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  appId: z.string().min(1).optional(),
  sdkVersion: z.string().min(1).optional(),
  level: z.coerce.number().int().min(1).max(4).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  cursor: z.string().min(1).optional(),
});

const fileListSchema = z.object({
  projectId: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().min(1).optional(),
});

const contextSchema = z.object({
  before: z.coerce.number().int().min(0).max(50).optional(),
  after: z.coerce.number().int().min(0).max(50).optional(),
});

const idSchema = z.string().uuid();

@UseGuards(JwtAuthGuard)
@Controller('logs')
export class LogsController {
  constructor(private readonly logs: LogsService) {}

  @Post('upload')
  @HttpCode(200)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } }),
  )
  async upload(
    @CurrentUser() user: CurrentUserPayload,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: unknown,
  ) {
    if (!file) {
      throw new ApiException({
        code: 'LOG_FILE_REQUIRED',
        message: 'file is required',
        status: 400,
      });
    }
    const dto = uploadSchema.parse(body);
    return this.logs.upload({
      actorUserId: user.userId,
      projectId: dto.projectId,
      file,
      fileName: dto.fileName,
    });
  }

  @Get('events/search')
  async search(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: unknown,
  ) {
    const dto = searchSchema.parse(query);
    return this.logs.searchEvents({ actorUserId: user.userId, ...dto });
  }

  @Get('files')
  async listFiles(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: unknown,
  ) {
    const dto = fileListSchema.parse(query);
    return this.logs.listLogFiles({ actorUserId: user.userId, ...dto });
  }

  @Get('events/:id')
  async getEvent(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    const eventId = idSchema.parse(id);
    return this.logs.getEventDetail({ actorUserId: user.userId, id: eventId });
  }

  @Get('events/:id/context')
  async getEventContext(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Query() query: unknown,
  ) {
    const eventId = idSchema.parse(id);
    const dto = contextSchema.parse(query);
    return this.logs.getEventContext({
      actorUserId: user.userId,
      id: eventId,
      ...dto,
    });
  }

  @Get('files/:id')
  async getLogFile(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    const fileId = idSchema.parse(id);
    return this.logs.getLogFileDetail({ actorUserId: user.userId, id: fileId });
  }

  @Delete('files/:id')
  async deleteLogFile(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    const fileId = idSchema.parse(id);
    return this.logs.deleteLogFile({ actorUserId: user.userId, id: fileId });
  }
}
