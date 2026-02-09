import { Injectable } from '@nestjs/common';
import { ApiException } from '../../common/api-exception';
import { PrismaService } from '../../database/prisma.service';

/**
 * Shared helper service for logs module.
 * Contains common utilities used across multiple log services.
 */
@Injectable()
export class LogsHelperService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Decode event cursor for pagination
   */
  decodeCursor(cursor: string): { id: string; timestampMs: bigint } {
    try {
      const json = Buffer.from(cursor, 'base64').toString('utf8');
      const parsed = JSON.parse(json) as unknown;
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('cursor is not an object');
      }
      const obj = parsed as { id?: unknown; timestampMs?: unknown };
      if (typeof obj.id !== 'string') throw new Error('cursor.id invalid');
      const ts =
        typeof obj.timestampMs === 'string'
          ? BigInt(obj.timestampMs)
          : typeof obj.timestampMs === 'number'
            ? BigInt(Math.trunc(obj.timestampMs))
            : null;
      if (!ts) throw new Error('cursor.timestampMs invalid');
      return { id: obj.id, timestampMs: ts };
    } catch {
      throw new ApiException({
        code: 'INVALID_CURSOR',
        message: 'Invalid cursor',
        status: 400,
      });
    }
  }

  /**
   * Encode event cursor for pagination
   */
  encodeCursor(item: { id: string; timestampMs: bigint }): string {
    const payload = JSON.stringify({
      id: item.id,
      timestampMs: item.timestampMs.toString(),
    });
    return Buffer.from(payload, 'utf8').toString('base64');
  }

  /**
   * Decode file cursor for pagination
   */
  decodeFileCursor(cursor: string): { id: string; uploadedAt: Date } {
    try {
      const json = Buffer.from(cursor, 'base64').toString('utf8');
      const parsed = JSON.parse(json) as unknown;
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('cursor is not an object');
      }
      const obj = parsed as { id?: unknown; uploadedAtMs?: unknown };
      if (typeof obj.id !== 'string') throw new Error('cursor.id invalid');
      const uploadedAtMs =
        typeof obj.uploadedAtMs === 'number'
          ? obj.uploadedAtMs
          : typeof obj.uploadedAtMs === 'string'
            ? Number(obj.uploadedAtMs)
            : NaN;
      if (!Number.isFinite(uploadedAtMs)) {
        throw new Error('cursor.uploadedAtMs invalid');
      }
      return { id: obj.id, uploadedAt: new Date(uploadedAtMs) };
    } catch {
      throw new ApiException({
        code: 'INVALID_CURSOR',
        message: 'Invalid cursor',
        status: 400,
      });
    }
  }

  /**
   * Encode file cursor for pagination
   */
  encodeFileCursor(item: { id: string; uploadedAt: Date }): string {
    const payload = JSON.stringify({
      id: item.id,
      uploadedAtMs: item.uploadedAt.getTime(),
    });
    return Buffer.from(payload, 'utf8').toString('base64');
  }

  /**
   * Assert that a log file belongs to a project
   */
  async assertLogFileInProject(params: {
    projectId: string;
    logFileId: string;
  }): Promise<void> {
    const found = await this.prisma.logFile.findFirst({
      where: { id: params.logFileId, projectId: params.projectId },
      select: { id: true },
    });
    if (!found) {
      throw new ApiException({
        code: 'LOG_FILE_NOT_FOUND',
        message: 'Log file not found',
        status: 404,
      });
    }
  }

  /**
   * Truncate text to a maximum length
   */
  truncateText(value: string, maxLen: number): string {
    const normalized = value.replace(/\s+/g, ' ').trim();
    if (normalized.length <= maxLen) return normalized;
    return `${normalized.slice(0, Math.max(0, maxLen - 1))}…`;
  }

  private sanitizeTextLine(value: string): string {
    let out = value;

    out = out.replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer ***');
    out = out.replace(
      /("(?:accessToken|refreshToken|token|secret|password|pwd|apiKey|appKey|secretKey|clientSecret|authorization)"\s*:\s*")([^"]+)(")/gi,
      '$1***$3',
    );
    out = out.replace(
      /\b(access_token|refresh_token|token|secret|password|pwd|api_key|app_key|secret_key|client_secret|authorization)\s*=\s*([^\s&]+)/gi,
      '$1=***',
    );

    return out;
  }

  private maskBrokerUrl(url: string): string {
    if (!url.trim()) return '(empty)';
    return url.replace(
      /(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})/g,
      '$1.***.***.$4',
    );
  }

  private normalizeKey(key: string): string {
    return key.toLowerCase().replace(/[-_]/g, '');
  }

  private shouldRedactKey(key: string): boolean {
    const k = this.normalizeKey(key);

    if (k.includes('token') || k.includes('sdkauth')) return true;
    if (k.includes('secret')) return true;
    if (
      k.includes('appid') ||
      k.includes('clientid') ||
      k.includes('clientsecret')
    )
      return true;
    if (k === 'username') return true;
    if ((k.includes('user') && k.includes('id')) || k === 'uid') return true;
    if (k.includes('password') || k.includes('pwd')) return true;
    if (k.includes('challenge')) return true;
    if (k.includes('key') && !k.includes('keyboard') && !k.endsWith('keys'))
      return true;

    return false;
  }

  private maskSecretValue(value: unknown): string {
    let s = '';
    if (typeof value === 'string') s = value.trim();
    else if (typeof value === 'number' || typeof value === 'boolean')
      s = String(value);
    else if (typeof value === 'bigint') s = value.toString();
    else if (typeof value === 'symbol') s = value.toString();
    else if (typeof value === 'function') {
      const name = value.name ? ` ${value.name}` : '';
      s = `[function${name}]`;
    } else if (
      value !== null &&
      value !== undefined &&
      typeof value === 'object'
    ) {
      try {
        s = JSON.stringify(value);
      } catch {
        s = '';
      }
    }
    if (!s) return '***';
    if (s.length <= 8) return '***';
    return `${s.slice(0, 4)}…${s.slice(-4)}`;
  }

  private sanitizeMsgJson(value: unknown): unknown {
    if (value === null || value === undefined) return value;
    if (typeof value === 'string') return this.sanitizeTextLine(value);
    if (
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      typeof value === 'bigint'
    ) {
      return value;
    }
    if (Array.isArray(value)) {
      return value.map((v) => this.sanitizeMsgJson(v));
    }
    if (typeof value !== 'object') return value;

    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(obj)) {
      const k = this.normalizeKey(key);
      if (k === 'broker' || k === 'host') {
        out[key] =
          typeof v === 'string'
            ? this.maskBrokerUrl(v)
            : this.maskSecretValue(v);
        continue;
      }
      if (this.shouldRedactKey(key)) {
        out[key] = this.maskSecretValue(v);
        continue;
      }
      out[key] = this.sanitizeMsgJson(v);
    }
    return out;
  }

  /**
   * Extract a preview string from msgJson
   */
  msgPreviewFromJson(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string')
      return this.truncateText(this.sanitizeTextLine(value), 240);
    if (typeof value === 'number' || typeof value === 'boolean') {
      return this.truncateText(String(value), 240);
    }
    if (Array.isArray(value)) {
      try {
        return this.truncateText(
          JSON.stringify(this.sanitizeMsgJson(value)),
          240,
        );
      } catch {
        return this.truncateText(String(value), 240);
      }
    }
    if (typeof value === 'object') {
      const obj = this.sanitizeMsgJson(value) as Record<string, unknown>;
      const knownKeys = [
        'data',
        'message',
        'msg',
        'error',
        'err',
        'reason',
        'detail',
      ];
      for (const key of knownKeys) {
        const v = obj[key];
        if (typeof v === 'string' && v.trim()) {
          return this.truncateText(v, 240);
        }
      }
      try {
        return this.truncateText(JSON.stringify(obj), 240);
      } catch {
        return this.truncateText(Object.prototype.toString.call(value), 240);
      }
    }
    if (typeof value === 'bigint') {
      return this.truncateText(value.toString(), 240);
    }
    if (typeof value === 'symbol') {
      return this.truncateText(value.toString(), 240);
    }
    if (typeof value === 'function') {
      const name = value.name ? ` ${value.name}` : '';
      return this.truncateText(`[function${name}]`, 240);
    }
    return this.truncateText(Object.prototype.toString.call(value), 240);
  }

  /**
   * Extract command info from msgJson
   */
  extractCommandInfo(msgJson: unknown): {
    commandName: string | null;
    commandCode: string | null;
  } {
    if (!msgJson || typeof msgJson !== 'object') {
      return { commandName: null, commandCode: null };
    }
    const obj = msgJson as Record<string, unknown>;
    const commandName =
      typeof obj.commandName === 'string' ? obj.commandName : null;
    const commandCode =
      typeof obj.commandCode === 'string' ? obj.commandCode : null;
    return { commandName, commandCode };
  }
}
