import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { ApiException } from '../common/api-exception';
import { parseRedisUrl } from '../common/redis-connection';
import { LogsParserService } from './logs.parser.service';
import {
  LOG_PROCESSING_JOB_NAME,
  LOG_PROCESSING_QUEUE_NAME,
} from './log-processing.constants';

@Injectable()
export class LogProcessingService implements OnModuleDestroy {
  private readonly logger = new Logger(LogProcessingService.name);
  private readonly isTest: boolean;
  private readonly queue: Queue | null;

  constructor(
    private readonly config: ConfigService,
    private readonly parser: LogsParserService,
  ) {
    this.isTest =
      (this.config.get<string>('NODE_ENV') ?? 'development') === 'test';
    const redisUrl = this.config.get<string>('REDIS_URL');

    if (this.isTest || !redisUrl) {
      this.queue = null;
      return;
    }

    this.queue = new Queue(LOG_PROCESSING_QUEUE_NAME, {
      connection: parseRedisUrl(redisUrl),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { count: 200 },
        removeOnFail: { count: 500 },
      },
    });
  }

  async enqueueLogFileProcessing(logFileId: string): Promise<void> {
    if (!logFileId.trim()) {
      throw new ApiException({
        code: 'LOG_FILE_ID_REQUIRED',
        message: 'logFileId is required',
        status: 400,
      });
    }

    if (!this.queue) {
      // Keep e2e tests working without requiring a separate worker process.
      this.logger.warn(
        `LOG processing queue disabled; processing inline (logFileId=${logFileId})`,
      );
      setImmediate(
        () =>
          void this.parser.processLogFile(logFileId, { analyze: !this.isTest }),
      );
      return;
    }

    try {
      await this.queue.add(
        LOG_PROCESSING_JOB_NAME,
        { logFileId },
        { jobId: logFileId },
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      // BullMQ throws on duplicate jobId; treat as idempotent enqueue.
      if (/Job .* already exists/i.test(message)) return;
      throw e;
    }
  }

  async onModuleDestroy() {
    await this.queue?.close();
  }
}
