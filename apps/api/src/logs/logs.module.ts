import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { LogsController } from './logs.controller';
import { LogsParserService } from './logs.parser.service';
import { LogsService } from './logs.service';

@Module({
  imports: [StorageModule],
  controllers: [LogsController],
  providers: [LogsService, LogsParserService],
  exports: [LogsService, LogsParserService],
})
export class LogsModule {}
