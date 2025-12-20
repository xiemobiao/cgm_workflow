export type PutObjectInput = {
  key: string;
  body: Buffer;
  contentType?: string;
};

export interface StorageAdapter {
  putObject(input: PutObjectInput): Promise<void>;
  getObjectBuffer(key: string): Promise<Buffer>;
}

export const STORAGE_ADAPTER = 'STORAGE_ADAPTER';
