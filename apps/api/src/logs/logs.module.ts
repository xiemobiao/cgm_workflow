import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { BluetoothService } from './bluetooth.service';
import { LoganDecryptService } from './logan-decrypt.service';
import { LogsController } from './logs.controller';
import { LogsParserService } from './logs.parser.service';
import { LogsService } from './logs.service';

@Module({
  imports: [StorageModule],
  controllers: [LogsController],
  providers: [LogsService, LogsParserService, LoganDecryptService, BluetoothService],
  exports: [LogsService, LogsParserService, BluetoothService],
})
export class LogsModule {}
