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
import { SessionStatus } from '@prisma/client';
import { z } from 'zod';
import { ApiException } from '../common/api-exception';
import { CurrentUser } from '../auth/current-user.decorator';
import type { CurrentUserPayload } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BluetoothService } from './bluetooth.service';
import { LogsService } from './logs.service';
import { LogsAnalyzerService } from './logs-analyzer.service';

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
  levelGte: z.coerce.number().int().min(1).max(4).optional(),
  levelLte: z.coerce.number().int().min(1).max(4).optional(),
  stage: z.string().min(1).optional(),
  op: z.string().min(1).optional(),
  result: z.string().min(1).optional(),
  // Tracking field filters
  linkCode: z.string().min(1).optional(),
  requestId: z.string().min(1).optional(),
  attemptId: z.string().min(1).optional(),
  deviceMac: z.string().min(1).optional(),
  deviceSn: z.string().min(1).optional(),
  errorCode: z.string().min(1).optional(),
  excludeNoisy: z.coerce.boolean().optional(),
  // Content search
  msgContains: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
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

const batchDeleteSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
});

// Tracing schemas
const traceLinkCodeSchema = z.object({
  projectId: z.string().uuid(),
  logFileId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(2000).optional(),
});

const traceRequestIdSchema = z.object({
  projectId: z.string().uuid(),
  logFileId: z.string().uuid().optional(),
});

const traceAttemptIdSchema = z.object({
  projectId: z.string().uuid(),
  logFileId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(2000).optional(),
});

const traceDeviceMacSchema = z.object({
  projectId: z.string().uuid(),
  logFileId: z.string().uuid().optional(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  limit: z.coerce.number().int().min(1).max(2000).optional(),
});

const traceDeviceSnSchema = z.object({
  projectId: z.string().uuid(),
  logFileId: z.string().uuid().optional(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  limit: z.coerce.number().int().min(1).max(2000).optional(),
});

// Statistics schemas
const statsSchema = z.object({
  projectId: z.string().uuid(),
  logFileId: z.string().uuid().optional(),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
});

const errorHotspotsSchema = z.object({
  projectId: z.string().uuid(),
  logFileId: z.string().uuid().optional(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const timelineSchema = z.object({
  projectId: z.string().uuid(),
  logFileId: z.string().uuid().optional(),
  linkCode: z.string().min(1).optional(),
  deviceMac: z.string().min(1).optional(),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
});

// Command chain schema
const commandChainsSchema = z.object({
  projectId: z.string().uuid(),
  logFileId: z.string().uuid().optional(),
  deviceMac: z.string().min(1).optional(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

// Relation discovery schemas
const linkCodeDevicesSchema = z.object({
  projectId: z.string().uuid(),
  logFileId: z.string().uuid().optional(),
});

const deviceSessionsSchema = z.object({
  projectId: z.string().uuid(),
  logFileId: z.string().uuid().optional(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
});

// Bluetooth debugging schemas
const bluetoothSessionsSchema = z.object({
  projectId: z.string().uuid(),
  logFileId: z.string().uuid().optional(),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  deviceMac: z.string().min(1).optional(),
  status: z.nativeEnum(SessionStatus).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

const bluetoothAggregateSchema = z.object({
  projectId: z.string().uuid(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  forceRefresh: z.coerce.boolean().optional(),
});

const bluetoothSessionDetailSchema = z.object({
  projectId: z.string().uuid(),
  logFileId: z.string().uuid().optional(),
});

const bluetoothCommandAnalysisSchema = z.object({
  projectId: z.string().uuid(),
  logFileId: z.string().uuid().optional(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  deviceMac: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
});

const bluetoothAnomaliesSchema = z.object({
  projectId: z.string().uuid(),
  logFileId: z.string().uuid().optional(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  deviceMac: z.string().min(1).optional(),
});

const bluetoothReconnectSummarySchema = z.object({
  projectId: z.string().uuid(),
  logFileId: z.string().uuid().optional(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  deviceMac: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  reconnectWindowMs: z.coerce
    .number()
    .int()
    .min(1000)
    .max(30 * 60 * 1000)
    .optional(),
});

const bluetoothErrorsSchema = z.object({
  projectId: z.string().uuid(),
  logFileId: z.string().uuid().optional(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  deviceMac: z.string().min(1).optional(),
});

const bluetoothErrorContextSchema = z.object({
  projectId: z.string().uuid(),
  contextSize: z.coerce.number().int().min(1).max(50).optional(),
});

const bluetoothAnomaliesEnhancedSchema = z.object({
  projectId: z.string().uuid(),
  logFileId: z.string().uuid().optional(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  deviceMac: z.string().min(1).optional(),
});

@UseGuards(JwtAuthGuard)
@Controller('logs')
export class LogsController {
  constructor(
    private readonly logs: LogsService,
    private readonly bluetooth: BluetoothService,
    private readonly analyzer: LogsAnalyzerService,
  ) {}

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

  @Get('files/:id/ble-quality')
  async getBleQualityReport(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    const fileId = idSchema.parse(id);
    return this.logs.getBleQualityReport({
      actorUserId: user.userId,
      id: fileId,
    });
  }

  @Get('files/:id/backend-quality')
  async getBackendQualityReport(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    const fileId = idSchema.parse(id);
    return this.logs.getBackendQualityReport({
      actorUserId: user.userId,
      id: fileId,
    });
  }

  @Get('files/:id/data-continuity')
  async getDataContinuityReport(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    const fileId = idSchema.parse(id);
    return this.logs.getDataContinuityReport({
      actorUserId: user.userId,
      id: fileId,
    });
  }

  @Get('files/:id/stream-session-quality')
  async getStreamSessionQualityReport(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    const fileId = idSchema.parse(id);
    return this.logs.getStreamSessionQualityReport({
      actorUserId: user.userId,
      id: fileId,
    });
  }

  @Get('files/:id/analysis')
  async getLogFileAnalysis(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    const fileId = idSchema.parse(id);
    return this.logs.getLogFileAnalysis({
      actorUserId: user.userId,
      logFileId: fileId,
    });
  }

  @Get('files/:id/event-flow-analysis')
  async getEventFlowAnalysis(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    const fileId = idSchema.parse(id);
    const analysis = await this.logs.getLogFileAnalysis({
      actorUserId: user.userId,
      logFileId: fileId,
    });

    return {
      mainFlowAnalysis: analysis.mainFlowAnalysis,
      eventCoverageAnalysis: analysis.eventCoverageAnalysis,
    };
  }

  @Post('files/:id/analyze')
  @HttpCode(200)
  async triggerLogFileAnalysis(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    const fileId = idSchema.parse(id);
    await this.logs.getLogFileDetail({ actorUserId: user.userId, id: fileId });
    // Trigger analysis asynchronously
    void this.analyzer.analyzeLogFile(fileId);
    return { message: 'Analysis triggered', logFileId: fileId };
  }

  @Delete('files/:id')
  async deleteLogFile(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    const fileId = idSchema.parse(id);
    return this.logs.deleteLogFile({ actorUserId: user.userId, id: fileId });
  }

  @Post('files/batch-delete')
  @HttpCode(200)
  async batchDeleteLogFiles(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: unknown,
  ) {
    const dto = batchDeleteSchema.parse(body);
    return this.logs.batchDeleteLogFiles({
      actorUserId: user.userId,
      ids: dto.ids,
    });
  }

  @Get('files/:id/diagnose')
  async diagnoseLogFile(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    const fileId = idSchema.parse(id);
    return this.logs.diagnoseLogFile({
      actorUserId: user.userId,
      logFileId: fileId,
    });
  }

  // ========== Tracing APIs ==========

  @Get('trace/link-code/:linkCode')
  async traceByLinkCode(
    @CurrentUser() user: CurrentUserPayload,
    @Param('linkCode') linkCode: string,
    @Query() query: unknown,
  ) {
    const dto = traceLinkCodeSchema.parse(query);
    return this.logs.traceByLinkCode({
      actorUserId: user.userId,
      projectId: dto.projectId,
      logFileId: dto.logFileId,
      linkCode,
      limit: dto.limit,
    });
  }

  @Get('trace/request-id/:requestId')
  async traceByRequestId(
    @CurrentUser() user: CurrentUserPayload,
    @Param('requestId') requestId: string,
    @Query() query: unknown,
  ) {
    const dto = traceRequestIdSchema.parse(query);
    return this.logs.traceByRequestId({
      actorUserId: user.userId,
      projectId: dto.projectId,
      logFileId: dto.logFileId,
      requestId,
    });
  }

  @Get('trace/attempt/:attemptId')
  async traceByAttemptId(
    @CurrentUser() user: CurrentUserPayload,
    @Param('attemptId') attemptId: string,
    @Query() query: unknown,
  ) {
    const dto = traceAttemptIdSchema.parse(query);
    return this.logs.traceByAttemptId({
      actorUserId: user.userId,
      projectId: dto.projectId,
      logFileId: dto.logFileId,
      attemptId,
      limit: dto.limit,
    });
  }

  @Get('trace/device/:deviceMac')
  async traceByDeviceMac(
    @CurrentUser() user: CurrentUserPayload,
    @Param('deviceMac') deviceMac: string,
    @Query() query: unknown,
  ) {
    const dto = traceDeviceMacSchema.parse(query);
    return this.logs.traceByDeviceMac({
      actorUserId: user.userId,
      projectId: dto.projectId,
      logFileId: dto.logFileId,
      deviceMac,
      startTime: dto.startTime,
      endTime: dto.endTime,
      limit: dto.limit,
    });
  }

  @Get('trace/device-sn/:deviceSn')
  async traceByDeviceSn(
    @CurrentUser() user: CurrentUserPayload,
    @Param('deviceSn') deviceSn: string,
    @Query() query: unknown,
  ) {
    const dto = traceDeviceSnSchema.parse(query);
    return this.logs.traceByDeviceSn({
      actorUserId: user.userId,
      projectId: dto.projectId,
      logFileId: dto.logFileId,
      deviceSn,
      startTime: dto.startTime,
      endTime: dto.endTime,
      limit: dto.limit,
    });
  }

  // ========== Statistics APIs ==========

  @Get('stats')
  async getStats(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: unknown,
  ) {
    const dto = statsSchema.parse(query);
    return this.logs.getEventStats({
      actorUserId: user.userId,
      projectId: dto.projectId,
      logFileId: dto.logFileId,
      startTime: dto.startTime,
      endTime: dto.endTime,
    });
  }

  @Get('stats/errors')
  async getErrorHotspots(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: unknown,
  ) {
    const dto = errorHotspotsSchema.parse(query);
    return this.logs.getErrorHotspots({
      actorUserId: user.userId,
      projectId: dto.projectId,
      logFileId: dto.logFileId,
      startTime: dto.startTime,
      endTime: dto.endTime,
      limit: dto.limit,
    });
  }

  @Get('timeline')
  async getTimeline(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: unknown,
  ) {
    const dto = timelineSchema.parse(query);
    return this.logs.getTimeline({
      actorUserId: user.userId,
      projectId: dto.projectId,
      logFileId: dto.logFileId,
      linkCode: dto.linkCode,
      deviceMac: dto.deviceMac,
      startTime: dto.startTime,
      endTime: dto.endTime,
      limit: dto.limit,
    });
  }

  // ========== Command Chain APIs ==========

  @Get('commands')
  async getCommandChains(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: unknown,
  ) {
    const dto = commandChainsSchema.parse(query);
    return this.logs.getCommandChains({
      actorUserId: user.userId,
      projectId: dto.projectId,
      logFileId: dto.logFileId,
      deviceMac: dto.deviceMac,
      startTime: dto.startTime,
      endTime: dto.endTime,
      limit: dto.limit,
    });
  }

  // ========== Relation Discovery APIs ==========

  @Get('trace/link-code/:linkCode/devices')
  async getLinkCodeDevices(
    @CurrentUser() user: CurrentUserPayload,
    @Param('linkCode') linkCode: string,
    @Query() query: unknown,
  ) {
    const dto = linkCodeDevicesSchema.parse(query);
    return this.logs.getLinkCodeDevices({
      actorUserId: user.userId,
      projectId: dto.projectId,
      logFileId: dto.logFileId,
      linkCode,
    });
  }

  @Get('trace/device/:deviceMac/sessions')
  async getDeviceSessions(
    @CurrentUser() user: CurrentUserPayload,
    @Param('deviceMac') deviceMac: string,
    @Query() query: unknown,
  ) {
    const dto = deviceSessionsSchema.parse(query);
    return this.logs.getDeviceSessions({
      actorUserId: user.userId,
      projectId: dto.projectId,
      logFileId: dto.logFileId,
      deviceMac,
      startTime: dto.startTime,
      endTime: dto.endTime,
    });
  }

  // ========== Bluetooth Debugging APIs ==========

  @Get('bluetooth/sessions')
  async getBluetoothSessions(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: unknown,
  ) {
    const dto = bluetoothSessionsSchema.parse(query);
    return this.bluetooth.getSessions({
      actorUserId: user.userId,
      projectId: dto.projectId,
      logFileId: dto.logFileId,
      startTime: dto.startTime,
      endTime: dto.endTime,
      deviceMac: dto.deviceMac,
      status: dto.status,
      limit: dto.limit,
    });
  }

  @Post('bluetooth/sessions/aggregate')
  @HttpCode(200)
  async aggregateBluetoothSessions(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: unknown,
  ) {
    const dto = bluetoothAggregateSchema.parse(body);
    return this.bluetooth.aggregateSessions({
      actorUserId: user.userId,
      projectId: dto.projectId,
      startTime: dto.startTime,
      endTime: dto.endTime,
      forceRefresh: dto.forceRefresh,
    });
  }

  @Get('bluetooth/session/:linkCode')
  async getBluetoothSessionDetail(
    @CurrentUser() user: CurrentUserPayload,
    @Param('linkCode') linkCode: string,
    @Query() query: unknown,
  ) {
    const dto = bluetoothSessionDetailSchema.parse(query);
    const result = await this.bluetooth.getSessionDetail({
      actorUserId: user.userId,
      projectId: dto.projectId,
      logFileId: dto.logFileId,
      linkCode,
    });
    if (!result) {
      throw new ApiException({
        code: 'SESSION_NOT_FOUND',
        message: 'Session not found',
        status: 404,
      });
    }
    return result;
  }

  @Get('bluetooth/commands/analysis')
  async analyzeBluetoothCommands(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: unknown,
  ) {
    const dto = bluetoothCommandAnalysisSchema.parse(query);
    return this.bluetooth.analyzeCommandChains({
      actorUserId: user.userId,
      projectId: dto.projectId,
      logFileId: dto.logFileId,
      startTime: dto.startTime,
      endTime: dto.endTime,
      deviceMac: dto.deviceMac,
      limit: dto.limit,
    });
  }

  @Get('bluetooth/anomalies')
  async detectBluetoothAnomalies(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: unknown,
  ) {
    const dto = bluetoothAnomaliesSchema.parse(query);
    return this.bluetooth.detectAnomalies({
      actorUserId: user.userId,
      projectId: dto.projectId,
      logFileId: dto.logFileId,
      startTime: dto.startTime,
      endTime: dto.endTime,
      deviceMac: dto.deviceMac,
    });
  }

  @Get('bluetooth/reconnect/summary')
  async getBluetoothReconnectSummary(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: unknown,
  ) {
    const dto = bluetoothReconnectSummarySchema.parse(query);
    return this.bluetooth.getReconnectSummary({
      actorUserId: user.userId,
      projectId: dto.projectId,
      logFileId: dto.logFileId,
      startTime: dto.startTime,
      endTime: dto.endTime,
      deviceMac: dto.deviceMac,
      limit: dto.limit,
      reconnectWindowMs: dto.reconnectWindowMs,
    });
  }

  @Get('bluetooth/errors/distribution')
  async getBluetoothErrorDistribution(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: unknown,
  ) {
    const dto = bluetoothErrorsSchema.parse(query);
    return this.bluetooth.getErrorDistribution({
      actorUserId: user.userId,
      projectId: dto.projectId,
      logFileId: dto.logFileId,
      startTime: dto.startTime,
      endTime: dto.endTime,
      deviceMac: dto.deviceMac,
    });
  }

  @Get('bluetooth/events/:eventId/context')
  async getBluetoothErrorContext(
    @CurrentUser() user: CurrentUserPayload,
    @Param('eventId') eventId: string,
    @Query() query: unknown,
  ) {
    const eventIdParsed = idSchema.parse(eventId);
    const dto = bluetoothErrorContextSchema.parse(query);
    const result = await this.bluetooth.analyzeErrorsWithContext({
      actorUserId: user.userId,
      projectId: dto.projectId,
      eventId: eventIdParsed,
      contextSize: dto.contextSize,
    });
    if (!result) {
      throw new ApiException({
        code: 'EVENT_NOT_FOUND',
        message: 'Event not found',
        status: 404,
      });
    }
    return result;
  }

  @Get('bluetooth/anomalies/enhanced')
  async detectBluetoothAnomaliesEnhanced(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: unknown,
  ) {
    const dto = bluetoothAnomaliesEnhancedSchema.parse(query);
    return this.bluetooth.detectAnomaliesEnhanced({
      actorUserId: user.userId,
      projectId: dto.projectId,
      logFileId: dto.logFileId,
      startTime: dto.startTime,
      endTime: dto.endTime,
      deviceMac: dto.deviceMac,
    });
  }
}
