import {
  Body,
  Controller,
  Get,
  HttpCode,
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
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  appId: z.string().min(1).optional(),
  sdkVersion: z.string().min(1).optional(),
  level: z.coerce.number().int().min(1).max(4).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  cursor: z.string().min(1).optional(),
});

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
}
