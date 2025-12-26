import { Injectable } from '@nestjs/common';
import { LogFileStatus, Prisma } from '@prisma/client';
import { ApiException } from '../common/api-exception';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';
import { StorageService } from '../storage/storage.service';
import { LoganDecryptService } from './logan-decrypt.service';

type OuterLine = {
  c: string;
  f: number;
  l: number;
  n?: string;
  i?: number;
  m?: boolean;
};

type InnerLine = {
  event: string;
  msg?: unknown;
  sdkInfo?: string;
  terminalInfo?: string;
  appInfo?: string;
};

function asRecord(x: unknown): Record<string, unknown> | null {
  if (!x || typeof x !== 'object') return null;
  return x as Record<string, unknown>;
}

function asString(x: unknown): string | undefined {
  if (typeof x === 'string') return x;
  return undefined;
}

function asNumber(x: unknown): number | undefined {
  if (typeof x === 'number' && Number.isFinite(x)) return x;
  return undefined;
}

function asBoolean(x: unknown): boolean | undefined {
  if (typeof x === 'boolean') return x;
  if (typeof x === 'number') return Boolean(x);
  return undefined;
}

function asStringOrNumber(x: unknown): string | undefined {
  if (typeof x === 'string') return x;
  if (typeof x === 'number' && Number.isFinite(x)) return String(Math.trunc(x));
  if (typeof x === 'bigint') return x.toString();
  return undefined;
}

function pickFirstString(
  obj: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const raw = asStringOrNumber(obj[key]);
    if (raw === undefined) continue;
    const value = raw.trim();
    if (value.length === 0) continue;
    return value;
  }
  return null;
}

function looksLikeMac(value: string): boolean {
  // Support common formats:
  // - AA:BB:CC:DD:EE:FF
  // - AA-BB-CC-DD-EE-FF
  // - AABBCCDDEEFF
  return (
    /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/.test(value) ||
    /^[0-9A-Fa-f]{12}$/.test(value)
  );
}

function parseKeyValueTokens(text: string): Record<string, string> {
  const tokens: Record<string, string> = {};
  const re = /(?:^|[\s,;])([A-Za-z_][A-Za-z0-9_]*)\s*[:=]\s*([^\s,;]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const key = m[1] ?? '';
    const raw = m[2] ?? '';
    if (!key || !raw) continue;
    const value = raw.trim();
    if (!value) continue;
    tokens[key] = value;
  }
  return tokens;
}

function extractTrackingFieldsFromText(text: string): {
  linkCode: string | null;
  requestId: string | null;
  deviceMac: string | null;
  deviceSn: string | null;
  errorCode: string | null;
} {
  const result = {
    linkCode: null as string | null,
    requestId: null as string | null,
    deviceMac: null as string | null,
    deviceSn: null as string | null,
    errorCode: null as string | null,
  };

  const tokens = parseKeyValueTokens(text);

  result.linkCode = pickFirstString(tokens, ['linkCode', 'link_code', 'LinkCode']);
  result.requestId = pickFirstString(tokens, [
    'requestId',
    'request_id',
    'RequestId',
    'reqId',
    'msgId',
    'messageId',
    'msg_id',
  ]);

  const macCandidate =
    pickFirstString(tokens, [
      'deviceMac',
      'device_mac',
      'mac',
      'DeviceMac',
      'macAddress',
    ]) ?? null;

  if (macCandidate) {
    result.deviceMac = macCandidate;
  }

  const tokenDevice = pickFirstString(tokens, ['device']);
  if (tokenDevice && looksLikeMac(tokenDevice)) {
    result.deviceMac = result.deviceMac ?? tokenDevice;
  }

  const deviceIdMaybeMac = pickFirstString(tokens, ['deviceId', 'device_id']);
  if (deviceIdMaybeMac && looksLikeMac(deviceIdMaybeMac)) {
    result.deviceMac = result.deviceMac ?? deviceIdMaybeMac;
  }

  result.deviceSn = pickFirstString(tokens, [
    'deviceSn',
    'device_sn',
    'sn',
    'SN',
    'serialNumber',
    'serial_number',
    'SerialNumber',
    'serial',
    'DeviceSn',
  ]);

  if (!result.deviceSn) {
    const topic = pickFirstString(tokens, ['topic', 'expectedTopic', 'topicFilter']);
    if (topic) {
      const t = topic.trim();
      const prefixes = ['data/', 'data_reply/'];
      for (const p of prefixes) {
        if (!t.startsWith(p)) continue;
        const sn = t.slice(p.length).trim();
        if (sn.length > 0) {
          result.deviceSn = sn;
          break;
        }
      }
    }
  }

  if (!result.deviceSn) {
    const url = pickFirstString(tokens, ['url', 'requestUrl']);
    if (url) {
      try {
        const u = new URL(url);
        const sn = u.searchParams.get('sn')?.trim();
        if (sn) result.deviceSn = sn;
      } catch {
        // ignore
      }
    }
  }

  if (!result.deviceSn && tokenDevice && !looksLikeMac(tokenDevice)) {
    result.deviceSn = tokenDevice;
  }

  const deviceIdMaybeSn = pickFirstString(tokens, ['deviceId', 'device_id']);
  if (!result.deviceSn && deviceIdMaybeSn && !looksLikeMac(deviceIdMaybeSn)) {
    result.deviceSn = deviceIdMaybeSn;
  }

  result.errorCode = pickFirstString(tokens, [
    'errorCode',
    'error_code',
    'code',
    'ErrorCode',
  ]);

  return result;
}

function firstUniqueString(values: Array<string | null | undefined>): string | null {
  const set = new Set<string>();
  for (const v of values) {
    if (!v || typeof v !== 'string') continue;
    const t = v.trim();
    if (!t) continue;
    set.add(t);
    if (set.size > 1) return null;
  }
  return set.size === 1 ? Array.from(set.values())[0] : null;
}

function applyTrackingFallback(events: Prisma.LogEventCreateManyInput[]) {
  const snByLinkCode = new Map<string, Set<string>>();
  const snByDeviceMac = new Map<string, Set<string>>();
  const macBySn = new Map<string, Set<string>>();

  const addToMap = (map: Map<string, Set<string>>, key: string, value: string) => {
    const set = map.get(key) ?? new Set<string>();
    set.add(value);
    map.set(key, set);
  };

  for (const e of events) {
    if (e.eventName === 'PARSER_ERROR') continue;
    const linkCode = typeof e.linkCode === 'string' ? e.linkCode.trim() : '';
    const deviceMac = typeof e.deviceMac === 'string' ? e.deviceMac.trim() : '';
    const deviceSn = typeof e.deviceSn === 'string' ? e.deviceSn.trim() : '';
    if (linkCode && deviceSn) addToMap(snByLinkCode, linkCode, deviceSn);
    if (deviceMac && deviceSn) addToMap(snByDeviceMac, deviceMac, deviceSn);
    if (deviceSn && deviceMac) addToMap(macBySn, deviceSn, deviceMac);
  }

  const resolveUnique = (map: Map<string, Set<string>>, key: string): string | null => {
    const set = map.get(key);
    if (!set || set.size !== 1) return null;
    return Array.from(set.values())[0] ?? null;
  };

  const uniqueSn = firstUniqueString(events.map((e) => e.deviceSn as string | null));
  const uniqueMac = firstUniqueString(events.map((e) => e.deviceMac as string | null));

  for (const e of events) {
    if (e.eventName === 'PARSER_ERROR') continue;

    const hasSn = typeof e.deviceSn === 'string' && e.deviceSn.trim().length > 0;
    const hasMac = typeof e.deviceMac === 'string' && e.deviceMac.trim().length > 0;

    if (!hasSn) {
      const linkCode = typeof e.linkCode === 'string' ? e.linkCode.trim() : '';
      const deviceMac = typeof e.deviceMac === 'string' ? e.deviceMac.trim() : '';
      const fromLink = linkCode ? resolveUnique(snByLinkCode, linkCode) : null;
      const fromMac = deviceMac ? resolveUnique(snByDeviceMac, deviceMac) : null;
      e.deviceSn = fromLink ?? fromMac ?? uniqueSn;
    }

    if (!hasMac) {
      const deviceSn = typeof e.deviceSn === 'string' ? e.deviceSn.trim() : '';
      const fromSn = deviceSn ? resolveUnique(macBySn, deviceSn) : null;
      e.deviceMac = fromSn ?? uniqueMac;
    }
  }
}

// Extract tracking fields from msg object for flow tracing
export function extractTrackingFields(msg: unknown): {
  linkCode: string | null;
  requestId: string | null;
  deviceMac: string | null;
  deviceSn: string | null;
  errorCode: string | null;
} {
  const result = {
    linkCode: null as string | null,
    requestId: null as string | null,
    deviceMac: null as string | null,
    deviceSn: null as string | null,
    errorCode: null as string | null,
  };

  const msgString = asString(msg);
  if (msgString !== undefined) {
    const trimmed = msgString.trim();
    if (trimmed.length === 0) return result;
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        return extractTrackingFields(parsed);
      } catch {
        // ignore
      }
    }
    return extractTrackingFieldsFromText(trimmed);
  }

  const root = asRecord(msg);
  if (!root) return result;

  const candidates: Record<string, unknown>[] = [root];
  const nestedData = asRecord(root.data);
  if (nestedData) candidates.push(nestedData);

  for (const obj of candidates) {
    if (!result.linkCode) {
      result.linkCode =
        pickFirstString(obj, ['linkCode', 'link_code', 'LinkCode']) ?? null;
    }

    if (!result.requestId) {
      result.requestId =
        pickFirstString(obj, [
          'requestId',
          'request_id',
          'RequestId',
          'reqId',
          'msgId',
          'messageId',
          'msg_id',
        ]) ?? null;
    }

    if (!result.deviceMac) {
      const macCandidate =
        pickFirstString(obj, [
          'deviceMac',
          'device_mac',
          'mac',
          'DeviceMac',
          'macAddress',
        ]) ?? null;

      if (macCandidate) {
        result.deviceMac = macCandidate;
      } else {
        const deviceIdMaybeMac =
          pickFirstString(obj, ['deviceId', 'device_id']) ?? null;
        result.deviceMac =
          deviceIdMaybeMac && looksLikeMac(deviceIdMaybeMac)
            ? deviceIdMaybeMac
            : null;
      }
    }

    if (!result.deviceSn) {
      result.deviceSn =
        pickFirstString(obj, [
          'deviceSn',
          'device_sn',
          'sn',
          'SN',
          'serialNumber',
          'serial_number',
          'SerialNumber',
          'serial',
          'DeviceSn',
        ]) ?? null;

      if (!result.deviceSn) {
        const topic =
          pickFirstString(obj, ['topic', 'expectedTopic', 'topicFilter']) ??
          null;
        if (topic) {
          const prefixes = ['data/', 'data_reply/'];
          for (const p of prefixes) {
            if (!topic.startsWith(p)) continue;
            const sn = topic.slice(p.length).trim();
            if (sn.length > 0) {
              result.deviceSn = sn;
              break;
            }
          }
        }
      }

      if (!result.deviceSn) {
        const url = pickFirstString(obj, ['url', 'requestUrl']) ?? null;
        if (url) {
          try {
            const u = new URL(url);
            const sn = u.searchParams.get('sn')?.trim();
            if (sn) result.deviceSn = sn;
          } catch {
            // ignore
          }
        }
      }

      if (!result.deviceSn) {
        const deviceIdMaybeSn =
          pickFirstString(obj, ['deviceId', 'device_id']) ?? null;
        result.deviceSn =
          deviceIdMaybeSn && !looksLikeMac(deviceIdMaybeSn)
            ? deviceIdMaybeSn
            : null;
      }
    }

    if (!result.errorCode) {
      const errorObj = asRecord(obj.error);
      result.errorCode =
        (errorObj
          ? pickFirstString(errorObj, ['code', 'errorCode', 'error_code'])
          : null) ??
        pickFirstString(obj, ['errorCode', 'error_code', 'code']) ??
        null;
    }
  }

  return result;
}

@Injectable()
export class LogsParserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly loganDecrypt: LoganDecryptService,
  ) {}

  enqueue(logFileId: string) {
    void this.parseAndPersist(logFileId);
  }

  private async parseAndPersist(logFileId: string) {
    const logFile = await this.prisma.logFile.findUnique({
      where: { id: logFileId },
    });
    if (!logFile) return;

    let hadError = false;

    try {
      if (!logFile.storageKey) {
        throw new ApiException({
          code: 'LOG_FILE_STORAGE_KEY_MISSING',
          message: 'Log file storage key is missing',
          status: 500,
        });
      }

      const buf = await this.storage.getObjectBuffer(logFile.storageKey);

      // Auto-detect and decrypt Logan encrypted binary files
      const isLoganEncrypted = this.loganDecrypt.isLoganEncrypted(buf);
      let text: string;
      let loganStats:
        | { blocksTotal: number; blocksSucceeded: number; blocksFailed: number }
        | null = null;
      if (isLoganEncrypted) {
        const decrypted = this.loganDecrypt.decrypt(buf);
        text = decrypted.text;
        loganStats = {
          blocksTotal: decrypted.blocksTotal,
          blocksSucceeded: decrypted.blocksSucceeded,
          blocksFailed: decrypted.blocksFailed,
        };
      } else {
        text = buf.toString('utf8');
      }

      const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);

      const nowMs = BigInt(Date.now());
      const parserErrorEventName = 'PARSER_ERROR';

      const events: Prisma.LogEventCreateManyInput[] = [];

      if (isLoganEncrypted && loganStats) {
        // If all blocks failed to decrypt, surface a clear error so users can fix LOGAN_DECRYPT_KEY/IV.
        if (loganStats.blocksTotal > 0 && loganStats.blocksSucceeded === 0) {
          hadError = true;
          events.push({
            projectId: logFile.projectId,
            logFileId: logFile.id,
            timestampMs: nowMs,
            level: 4,
            eventName: parserErrorEventName,
            msgJson: {
              message:
                'Failed to decrypt Logan log file. Please check LOGAN_DECRYPT_KEY / LOGAN_DECRYPT_IV.',
              logan: loganStats,
            } as unknown as Prisma.InputJsonValue,
            rawLine: null,
          });
        } else if (loganStats.blocksFailed > 0) {
          // Partial decryption failures usually indicate data corruption; keep it visible for debugging.
          hadError = true;
          events.push({
            projectId: logFile.projectId,
            logFileId: logFile.id,
            timestampMs: nowMs,
            level: 3,
            eventName: parserErrorEventName,
            msgJson: {
              message: `Logan decrypt partially failed (${loganStats.blocksFailed}/${loganStats.blocksTotal} blocks). Parsed output may be incomplete.`,
              logan: loganStats,
            } as unknown as Prisma.InputJsonValue,
            rawLine: null,
          });
        }
      }

      for (const line of lines) {
        try {
          const outerRaw = JSON.parse(line) as unknown;
          const outerObj = asRecord(outerRaw);
          if (!outerObj) throw new Error('outer is not an object');

          const outer: OuterLine = {
            c: asString(outerObj.c) ?? '',
            f: asNumber(outerObj.f) ?? 0,
            l: asNumber(outerObj.l) ?? 0,
            n: asString(outerObj.n),
            i: asNumber(outerObj.i),
            m: asBoolean(outerObj.m),
          };

          if (!outer.c) throw new Error('missing outer.c');
          if (!outer.f) throw new Error('missing outer.f');
          if (!outer.l) throw new Error('missing outer.l');

          // Skip clogan header line - it's not a real log event
          // Header format: {"c":"clogan header","f":1,"l":...,"n":"clogan","i":1,"m":true}
          if (outer.c === 'clogan header' || outer.n === 'clogan') {
            continue;
          }

          const innerRaw = JSON.parse(outer.c) as unknown;
          const innerObj = asRecord(innerRaw);
          if (!innerObj) throw new Error('inner is not an object');

          const eventName = asString(innerObj.event);
          if (!eventName) throw new Error('missing inner.event');

          const inner: InnerLine = {
            event: eventName,
            msg: innerObj.msg,
            sdkInfo: asString(innerObj.sdkInfo),
            terminalInfo: asString(innerObj.terminalInfo),
            appInfo: asString(innerObj.appInfo),
          };

          // Extract tracking fields from msg
          const tracking = extractTrackingFields(inner.msg);

          events.push({
            projectId: logFile.projectId,
            logFileId: logFile.id,
            timestampMs: BigInt(Math.trunc(outer.l)),
            level: Math.trunc(outer.f),
            eventName: inner.event,
            sdkVersion: inner.sdkInfo ?? null,
            appId: inner.appInfo ?? null,
            terminalInfo: inner.terminalInfo ?? null,
            threadName: outer.n ?? null,
            threadId:
              outer.i !== undefined ? BigInt(Math.trunc(outer.i)) : null,
            isMainThread: outer.m ?? null,
            msgJson:
              inner.msg === undefined
                ? undefined
                : (inner.msg as Prisma.InputJsonValue),
            rawLine: null,
            // Tracking fields
            linkCode: tracking.linkCode,
            requestId: tracking.requestId,
            deviceMac: tracking.deviceMac,
            deviceSn: tracking.deviceSn,
            errorCode: tracking.errorCode,
          });
        } catch (e) {
          hadError = true;
          const message = e instanceof Error ? e.message : String(e);
          events.push({
            projectId: logFile.projectId,
            logFileId: logFile.id,
            timestampMs: nowMs,
            level: 4,
            eventName: parserErrorEventName,
            msgJson: { message } as unknown as Prisma.InputJsonValue,
            rawLine: line,
          });
        }
      }

      applyTrackingFallback(events);

      const isGoneError = (e: unknown) =>
        e instanceof Prisma.PrismaClientKnownRequestError &&
        (e.code === 'P2025' || e.code === 'P2003');

      try {
        // Use longer timeout for large files (28000+ events need more than 5s)
        await this.prisma.$transaction(
          async (tx) => {
          // Delete existing events and stats for this file
          await tx.logEventStats.deleteMany({ where: { logFileId: logFile.id } });
          await tx.logEvent.deleteMany({ where: { logFileId: logFile.id } });

          const batchSize = 500;
          for (let i = 0; i < events.length; i += batchSize) {
            const batch = events.slice(i, i + batchSize);
            if (batch.length === 0) continue;
            await tx.logEvent.createMany({ data: batch });
          }

          // Generate event statistics
          const statsMap = new Map<string, { eventName: string; level: number; count: number }>();
          for (const event of events) {
            const key = `${event.eventName}:${event.level}`;
            const existing = statsMap.get(key);
            if (existing) {
              existing.count++;
            } else {
              statsMap.set(key, {
                eventName: event.eventName,
                level: event.level,
                count: 1,
              });
            }
          }

          // Insert statistics
          if (statsMap.size > 0) {
            await tx.logEventStats.createMany({
              data: Array.from(statsMap.values()).map((s) => ({
                projectId: logFile.projectId,
                logFileId: logFile.id,
                eventName: s.eventName,
                level: s.level,
                count: s.count,
              })),
            });
          }

          await tx.logFile.update({
            where: { id: logFile.id },
            data: {
              status: hadError ? LogFileStatus.failed : LogFileStatus.parsed,
              parserVersion: 'v2',
            },
          });
          },
          { timeout: 60000 }, // 60 seconds for large files
        );
      } catch (e) {
        if (isGoneError(e)) return;
        throw e;
      }

      await this.audit.record({
        projectId: logFile.projectId,
        actorUserId: null,
        action: hadError ? 'logs.parse.partial_failed' : 'logs.parse.success',
        targetType: 'LogFile',
        targetId: logFile.id,
        metadata: {
          lineCount: lines.length,
          logan: loganStats ?? undefined,
        },
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      try {
        await this.prisma.logFile.update({
          where: { id: logFile.id },
          data: { status: LogFileStatus.failed, parserVersion: 'v1' },
        });
      } catch (inner) {
        if (
          inner instanceof Prisma.PrismaClientKnownRequestError &&
          (inner.code === 'P2025' || inner.code === 'P2003')
        ) {
          return;
        }
        throw inner;
      }

      await this.audit.record({
        projectId: logFile.projectId,
        actorUserId: null,
        action: 'logs.parse.failed',
        targetType: 'LogFile',
        targetId: logFile.id,
        metadata: { message },
      });
    }
  }
}
