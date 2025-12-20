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
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
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
}
