import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { KnownIssuesModule } from '../known-issues/known-issues.module';
import { BluetoothService } from './bluetooth.service';
import { LoganDecryptService } from './logan-decrypt.service';
import { LogsController } from './logs.controller';
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
} from './services';

@Module({
  imports: [StorageModule, KnownIssuesModule],
  controllers: [LogsController],
  providers: [
    // Original service (facade for backward compatibility)
    LogsService,
    LogsParserService,
    LogProcessingService,
    LoganDecryptService,
    BluetoothService,
    LogsAnalyzerService,
    EventFlowAnalyzerService,
    // Refactored services
    LogsHelperService,
    LogsFileService,
    LogsSearchService,
    LogsTraceService,
    LogsStatsService,
  ],
  exports: [
    LogsService,
    LogsParserService,
    LogProcessingService,
    BluetoothService,
    LogsAnalyzerService,
    EventFlowAnalyzerService,
    // Export refactored services for other modules
    LogsHelperService,
    LogsFileService,
    LogsSearchService,
    LogsTraceService,
    LogsStatsService,
  ],
})
export class LogsModule {}
