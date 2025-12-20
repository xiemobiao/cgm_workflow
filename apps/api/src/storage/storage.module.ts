import path from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'minio';
import { STORAGE_ADAPTER } from './storage.types';
import { StorageService } from './storage.service';
import { LocalStorageAdapter } from './local-storage.adapter';
import { MinioStorageAdapter } from './minio-storage.adapter';

@Module({
  providers: [
    {
      provide: STORAGE_ADAPTER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const driver = config.get<string>('STORAGE_DRIVER') ?? 'local';
        if (driver === 'minio') {
          const endpoint = config.get<string>('MINIO_ENDPOINT');
          const accessKey = config.get<string>('MINIO_ACCESS_KEY');
          const secretKey = config.get<string>('MINIO_SECRET_KEY');
          const bucket = config.get<string>('MINIO_BUCKET');

          if (!endpoint || !accessKey || !secretKey || !bucket) {
            throw new Error(
              'MINIO_ENDPOINT/MINIO_ACCESS_KEY/MINIO_SECRET_KEY/MINIO_BUCKET are required when STORAGE_DRIVER=minio',
            );
          }

          const url = new URL(endpoint);
          const client = new Client({
            endPoint: url.hostname,
            port: url.port
              ? Number(url.port)
              : url.protocol === 'https:'
                ? 443
                : 80,
            useSSL: url.protocol === 'https:',
            accessKey,
            secretKey,
          });
          return new MinioStorageAdapter(client, bucket);
        }

        const baseDir =
          config.get<string>('LOCAL_STORAGE_DIR') ??
          path.resolve(process.cwd(), 'var', 'storage');
        return new LocalStorageAdapter(baseDir);
      },
    },
    StorageService,
  ],
  exports: [StorageService],
})
export class StorageModule {}
