import { Client } from 'minio';
import { ApiException } from '../common/api-exception';
import { PutObjectInput, StorageAdapter } from './storage.types';

export class MinioStorageAdapter implements StorageAdapter {
  constructor(
    private readonly client: Client,
    private readonly bucket: string,
  ) {}

  private async ensureBucket() {
    const exists = await this.client.bucketExists(this.bucket);
    if (!exists) await this.client.makeBucket(this.bucket);
  }

  async putObject(input: PutObjectInput): Promise<void> {
    await this.ensureBucket();
    await this.client.putObject(
      this.bucket,
      input.key,
      input.body,
      input.body.length,
      input.contentType ? { 'Content-Type': input.contentType } : undefined,
    );
  }

  async getObjectBuffer(key: string): Promise<Buffer> {
    const stream = await this.client.getObject(this.bucket, key);
    const chunks: Uint8Array[] = [];
    for await (const chunk of stream) {
      if (chunk instanceof Uint8Array) {
        chunks.push(chunk);
        continue;
      }
      if (typeof chunk === 'string') {
        chunks.push(Buffer.from(chunk));
        continue;
      }
      throw new ApiException({
        code: 'STORAGE_INVALID_STREAM_CHUNK',
        message: 'Storage stream yielded an unexpected chunk type',
        status: 500,
      });
    }
    const buf = Buffer.concat(chunks);
    if (buf.length === 0) {
      throw new ApiException({
        code: 'STORAGE_OBJECT_EMPTY',
        message: 'Storage object is empty',
        status: 404,
      });
    }
    return buf;
  }

  async deleteObject(key: string): Promise<void> {
    await this.ensureBucket();
    try {
      await this.client.removeObject(this.bucket, key);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('NoSuchKey') || msg.includes('Not Found')) return;
      throw e;
    }
  }
}
