import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import * as zlib from 'zlib';

// Logan encryption constants (default values, can be overridden via environment variables)
const LOGAN_KEY = Buffer.from(
  process.env.LOGAN_DECRYPT_KEY || 'oK1sJ7nP8vZ9tI0a',
  'utf8',
);
const LOGAN_IV = Buffer.from(
  process.env.LOGAN_DECRYPT_IV || 'pG1sV8pS8kL9oV4i',
  'utf8',
);

// Logan binary format markers
const HEADER_BYTE = 0x01;
const TAIL_BYTE = 0x00;

export type LoganDecryptResult = {
  text: string;
  blocksTotal: number;
  blocksSucceeded: number;
  blocksFailed: number;
};

@Injectable()
export class LoganDecryptService {
  /**
   * Detect if the buffer is a Logan encrypted binary file.
   * Logan encrypted files start with HEADER_BYTE (0x01) followed by
   * a 4-byte length field.
   */
  isLoganEncrypted(buffer: Buffer): boolean {
    if (buffer.length < 6) return false;

    // Check if first byte is HEADER_BYTE
    if (buffer[0] !== HEADER_BYTE) return false;

    // Read the length field and verify it's reasonable
    const length = buffer.readUInt32BE(1);
    if (length === 0 || length > buffer.length - 5) return false;

    // Additional heuristic: if it starts with '{' after decoding first few bytes,
    // it's likely already JSONL, not encrypted
    const firstBytes = buffer.subarray(0, Math.min(10, buffer.length));
    const asText = firstBytes.toString('utf8');
    if (asText.startsWith('{') || asText.startsWith('[')) return false;

    return true;
  }

  /**
   * Decrypt a Logan encrypted binary log file.
   *
   * Binary format:
   * - HEADER_BYTE (0x01)
   * - 4-byte length (big-endian)
   * - Encrypted data (AES-128-CBC)
   * - TAIL_BYTE (0x00)
   *
   * The encrypted data, after decryption, is gzip/zlib compressed JSONL.
   *
   * @param buffer The encrypted binary buffer
   * @returns Decrypted JSONL text + stats
   */
  decrypt(buffer: Buffer): LoganDecryptResult {
    const lines: string[] = [];
    let offset = 0;
    let blocksTotal = 0;
    let blocksSucceeded = 0;
    let blocksFailed = 0;

    while (offset < buffer.length) {
      // Skip non-HEADER_BYTE bytes
      if (buffer[offset] !== HEADER_BYTE) {
        offset++;
        continue;
      }

      // Need at least 5 bytes for header + length
      if (offset + 5 > buffer.length) break;

      // Read length (4 bytes, big-endian)
      const length = buffer.readUInt32BE(offset + 1);

      // Validate length
      if (length === 0) {
        offset++;
        continue;
      }

      // Calculate ciphertext boundaries
      const cipherStart = offset + 5;
      const cipherEnd = cipherStart + length;

      if (cipherEnd > buffer.length) break;

      const ciphertext = buffer.subarray(cipherStart, cipherEnd);

      blocksTotal++;

      try {
        // AES-128-CBC decryption
        const decipher = crypto.createDecipheriv(
          'aes-128-cbc',
          LOGAN_KEY,
          LOGAN_IV,
        );
        const decrypted = Buffer.concat([
          decipher.update(ciphertext),
          decipher.final(),
        ]);

        // Decompress (try gzip first, then raw zlib)
        let decompressed: Buffer;
        try {
          decompressed = zlib.gunzipSync(decrypted);
        } catch {
          try {
            decompressed = zlib.inflateSync(decrypted);
          } catch {
            // If both fail, try raw inflate
            decompressed = zlib.inflateRawSync(decrypted);
          }
        }

        // Convert to text and split by lines
        const text = decompressed.toString('utf8');
        const blockLines = text.split(/\r?\n/).filter((l) => l.trim());
        lines.push(...blockLines);
        blocksSucceeded++;
      } catch {
        // Decryption or decompression failed for this block, skip it
        // This can happen with corrupted data
        blocksFailed++;
      }

      // Move to next block (skip TAIL_BYTE if present)
      offset = cipherEnd;
      if (offset < buffer.length && buffer[offset] === TAIL_BYTE) {
        offset++;
      }
    }

    return {
      text: lines.join('\n'),
      blocksTotal,
      blocksSucceeded,
      blocksFailed,
    };
  }
}
