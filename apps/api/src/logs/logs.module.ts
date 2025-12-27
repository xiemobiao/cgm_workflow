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

@Module({
  imports: [StorageModule, KnownIssuesModule],
  controllers: [LogsController],
  providers: [
    LogsService,
    LogsParserService,
    LoganDecryptService,
    BluetoothService,
    LogsAnalyzerService,
    EventFlowAnalyzerService,
  ],
  exports: [
    LogsService,
    LogsParserService,
    BluetoothService,
    LogsAnalyzerService,
    EventFlowAnalyzerService,
  ],
})
export class LogsModule {}
