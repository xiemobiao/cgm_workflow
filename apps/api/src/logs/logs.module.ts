import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { KnownIssuesModule } from '../known-issues/known-issues.module';
import { BluetoothService } from './bluetooth.service';
import { BluetoothAnomalyService } from './bluetooth-anomaly.service';
import { BluetoothCommandService } from './bluetooth-command.service';
import { BluetoothSessionService } from './bluetooth-session.service';
import { LoganDecryptService } from './logan-decrypt.service';
import { LogsController } from './logs.controller';
import { LogsAutomationController } from './logs-automation.controller';
import { LogsParserService } from './logs.parser.service';
import { LogsService } from './logs.service';
import { LogsAnalyzerService } from './logs-analyzer.service';
import { EventFlowAnalyzerService } from './event-flow-analyzer.service';
import { LogProcessingService } from './log-processing.service';
// Refactored services
import {
  LogsHelperService,
  LogsFileService,
  LogsSearchService,
  LogsTraceService,
  LogsStatsService,
  LogsRegressionService,
  LogsAssertionService,
} from './services';

@Module({
  imports: [StorageModule, KnownIssuesModule],
  controllers: [LogsController, LogsAutomationController],
  providers: [
    // Original service (facade for backward compatibility)
    LogsService,
    LogsParserService,
    LogProcessingService,
    LoganDecryptService,
    BluetoothService,
    BluetoothSessionService,
    BluetoothAnomalyService,
    BluetoothCommandService,
    LogsAnalyzerService,
    EventFlowAnalyzerService,
    // Refactored services
    LogsHelperService,
    LogsFileService,
    LogsSearchService,
    LogsTraceService,
    LogsStatsService,
    LogsRegressionService,
    LogsAssertionService,
  ],
  exports: [
    LogsService,
    LogsParserService,
    LogProcessingService,
    BluetoothService,
    BluetoothSessionService,
    BluetoothAnomalyService,
    BluetoothCommandService,
    LogsAnalyzerService,
    EventFlowAnalyzerService,
    // Export refactored services for other modules
    LogsHelperService,
    LogsFileService,
    LogsSearchService,
    LogsTraceService,
    LogsStatsService,
    LogsRegressionService,
    LogsAssertionService,
  ],
})
export class LogsModule {}
