import fs from 'node:fs/promises';
import path from 'node:path';
import { ApiException } from '../common/api-exception';
import { PutObjectInput, StorageAdapter } from './storage.types';

export class LocalStorageAdapter implements StorageAdapter {
  private readonly baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = path.resolve(baseDir);
  }

  private resolvePath(key: string) {
    const safeKey = key.replace(/^\/+/, '');
    const fullPath = path.resolve(this.baseDir, safeKey);
    const prefix = this.baseDir.endsWith(path.sep)
      ? this.baseDir
      : `${this.baseDir}${path.sep}`;
    if (!fullPath.startsWith(prefix)) {
      throw new ApiException({
        code: 'INVALID_STORAGE_KEY',
        message: 'Invalid storage key',
        status: 400,
      });
    }
    return fullPath;
  }

  async putObject(input: PutObjectInput): Promise<void> {
    const fullPath = this.resolvePath(input.key);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, input.body);
  }

  async getObjectBuffer(key: string): Promise<Buffer> {
    const fullPath = this.resolvePath(key);
    return fs.readFile(fullPath);
  }
}
