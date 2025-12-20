import { Inject, Injectable } from '@nestjs/common';
import { STORAGE_ADAPTER } from './storage.types';
import type { PutObjectInput, StorageAdapter } from './storage.types';

@Injectable()
export class StorageService {
  constructor(
    @Inject(STORAGE_ADAPTER) private readonly adapter: StorageAdapter,
  ) {}

  putObject(input: PutObjectInput) {
    return this.adapter.putObject(input);
  }

  getObjectBuffer(key: string) {
    return this.adapter.getObjectBuffer(key);
  }
}
