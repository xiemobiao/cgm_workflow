import { Injectable } from '@nestjs/common';
import { SessionStatus } from '@prisma/client';
import { BluetoothAnomalyService } from './bluetooth-anomaly.service';
import { BluetoothCommandService } from './bluetooth-command.service';
import { BluetoothSessionService } from './bluetooth-session.service';

@Injectable()
export class BluetoothService {
  constructor(
    private readonly sessionService: BluetoothSessionService,
    private readonly commandService: BluetoothCommandService,
    private readonly anomalyService: BluetoothAnomalyService,
  ) {}

  async aggregateSessions(params: {
    actorUserId: string;
    projectId: string;
    startTime: string;
    endTime: string;
    forceRefresh?: boolean;
  }) {
    return this.sessionService.aggregateSessions(params);
  }

  async getSessions(params: {
    actorUserId: string;
    projectId: string;
    logFileId?: string;
    startTime?: string;
    endTime?: string;
    deviceMac?: string;
    status?: SessionStatus;
    limit?: number;
    cursor?: string;
  }) {
    return this.sessionService.getSessions(params);
  }

  async getSessionDetail(params: {
    actorUserId: string;
    projectId: string;
    logFileId?: string;
    linkCode: string;
  }) {
    return this.sessionService.getSessionDetail(params);
  }

  async analyzeCommandChains(params: {
    actorUserId: string;
    projectId: string;
    logFileId?: string;
    startTime: string;
    endTime: string;
    deviceMac?: string;
    limit?: number;
  }) {
    return this.commandService.analyzeCommandChains(params);
  }

  async getReconnectSummary(params: {
    actorUserId: string;
    projectId: string;
    logFileId?: string;
    startTime: string;
    endTime: string;
    deviceMac?: string;
    limit?: number;
    reconnectWindowMs?: number;
  }) {
    return this.commandService.getReconnectSummary(params);
  }

  async detectAnomalies(params: {
    actorUserId: string;
    projectId: string;
    logFileId?: string;
    startTime: string;
    endTime: string;
    deviceMac?: string;
  }) {
    return this.anomalyService.detectAnomalies(params);
  }

  async getErrorDistribution(params: {
    actorUserId: string;
    projectId: string;
    logFileId?: string;
    startTime: string;
    endTime: string;
    deviceMac?: string;
  }) {
    return this.anomalyService.getErrorDistribution(params);
  }

  async analyzeErrorsWithContext(params: {
    actorUserId: string;
    projectId: string;
    eventId: string;
    contextSize?: number;
  }) {
    return this.anomalyService.analyzeErrorsWithContext(params);
  }

  async detectAnomaliesEnhanced(params: {
    actorUserId: string;
    projectId: string;
    logFileId?: string;
    startTime: string;
    endTime: string;
    deviceMac?: string;
  }) {
    return this.anomalyService.detectAnomaliesEnhanced(params);
  }

  /**
   * Internal anomaly detection API for backend automation.
   * RBAC is intentionally skipped; caller must pass a validated project scope.
   */
  async detectAnomaliesEnhancedInternal(params: {
    projectId: string;
    logFileId?: string;
    startTime: string;
    endTime: string;
    deviceMac?: string;
  }) {
    return this.anomalyService.detectAnomaliesEnhancedInternal(params);
  }
}
