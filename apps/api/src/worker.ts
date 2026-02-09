import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Worker } from 'bullmq';
import { parseRedisUrl } from './common/redis-connection';
import { AppModule } from './app.module';
import { LogsParserService } from './logs/logs.parser.service';
import {
  LOG_PROCESSING_JOB_NAME,
  LOG_PROCESSING_QUEUE_NAME,
} from './logs/log-processing.constants';

const logger = new Logger('LogProcessingWorker');

function parseConcurrency(raw: string | undefined): number {
  if (!raw) return 2;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 2;
  return Math.min(Math.max(Math.trunc(n), 1), 50);
}

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });

  const config = app.get(ConfigService);
  const redisUrl = config.get<string>('REDIS_URL');
  if (!redisUrl) {
    logger.error('REDIS_URL is required to run log processing worker');
    await app.close();
    process.exit(1);
  }

  const concurrency = parseConcurrency(process.env.LOG_PROCESSING_CONCURRENCY);
  const parser = app.get(LogsParserService);

  const worker = new Worker(
    LOG_PROCESSING_QUEUE_NAME,
    async (job) => {
      if (job.name !== LOG_PROCESSING_JOB_NAME) return;
      const data = job.data as { logFileId?: unknown };
      const logFileId =
        typeof data.logFileId === 'string' ? data.logFileId : '';
      if (!logFileId.trim()) return;
      await parser.processLogFile(logFileId);
    },
    {
      connection: parseRedisUrl(redisUrl),
      concurrency,
    },
  );

  worker.on('failed', (job, err) => {
    logger.error(
      `Job failed: name=${job?.name ?? 'unknown'} id=${job?.id ?? 'unknown'} ${err instanceof Error ? err.message : String(err)}`,
    );
  });

  worker.on('completed', (job) => {
    logger.log(`Job completed: name=${job.name} id=${job.id ?? 'unknown'}`);
  });

  const shutdown = async () => {
    logger.log('Shutting down worker...');
    await worker.close();
    await app.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());

  logger.log(
    `Worker started: queue=${LOG_PROCESSING_QUEUE_NAME} concurrency=${concurrency}`,
  );
}

void bootstrap();
