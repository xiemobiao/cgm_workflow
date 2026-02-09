import { Injectable } from '@nestjs/common';
import { LogFileStatus, Prisma } from '@prisma/client';
import { ApiException } from '../common/api-exception';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';
import { StorageService } from '../storage/storage.service';
import { LoganDecryptService } from './logan-decrypt.service';
import { LogsAnalyzerService } from './logs-analyzer.service';

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

export type TrackingFields = {
  linkCode: string | null;
  requestId: string | null;
  attemptId: string | null;
  deviceMac: string | null;
  deviceSn: string | null;
  errorCode: string | null;
  stage: string | null;
  op: string | null;
  result: string | null;
};

function createEmptyTrackingFields(): TrackingFields {
  return {
    linkCode: null,
    requestId: null,
    attemptId: null,
    deviceMac: null,
    deviceSn: null,
    errorCode: null,
    stage: null,
    op: null,
    result: null,
  };
}

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

function normalizeTrim(value: string | null): string | null {
  const v = value?.trim() ?? '';
  return v.length > 0 ? v : null;
}

function normalizeLowerTrim(value: string | null): string | null {
  const v = normalizeTrim(value);
  return v ? v.toLowerCase() : null;
}

function extractDeviceSnFromTopic(topic: string | null): string | null {
  const t = normalizeTrim(topic);
  if (!t) return null;
  const prefixes = ['data/', 'data_reply/'];
  for (const p of prefixes) {
    if (!t.startsWith(p)) continue;
    const sn = t.slice(p.length).trim();
    if (sn.length > 0) return sn;
  }
  return null;
}

function extractDeviceSnFromUrl(url: string | null): string | null {
  const u = normalizeTrim(url);
  if (!u) return null;
  try {
    const parsed = new URL(u);
    const sn = parsed.searchParams.get('sn')?.trim();
    return sn && sn.length > 0 ? sn : null;
  } catch {
    return null;
  }
}

function firstUniqueString(
  values: Array<string | null | undefined>,
): string | null {
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
  const linkCodeBySn = new Map<string, Set<string>>();
  const linkCodeByMac = new Map<string, Set<string>>();

  const addToMap = (
    map: Map<string, Set<string>>,
    key: string,
    value: string,
  ) => {
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
    if (deviceSn && linkCode) addToMap(linkCodeBySn, deviceSn, linkCode);
    if (deviceMac && linkCode) addToMap(linkCodeByMac, deviceMac, linkCode);
  }

  const resolveUnique = (
    map: Map<string, Set<string>>,
    key: string,
  ): string | null => {
    const set = map.get(key);
    if (!set || set.size !== 1) return null;
    return Array.from(set.values())[0] ?? null;
  };

  const uniqueSn = firstUniqueString(
    events.map((e) => e.deviceSn as string | null),
  );
  const uniqueMac = firstUniqueString(
    events.map((e) => e.deviceMac as string | null),
  );

  for (const e of events) {
    if (e.eventName === 'PARSER_ERROR') continue;

    const hasSn =
      typeof e.deviceSn === 'string' && e.deviceSn.trim().length > 0;
    const hasMac =
      typeof e.deviceMac === 'string' && e.deviceMac.trim().length > 0;
    const hasLinkCode =
      typeof e.linkCode === 'string' && e.linkCode.trim().length > 0;

    if (!hasSn) {
      const linkCode = typeof e.linkCode === 'string' ? e.linkCode.trim() : '';
      const deviceMac =
        typeof e.deviceMac === 'string' ? e.deviceMac.trim() : '';
      const fromLink = linkCode ? resolveUnique(snByLinkCode, linkCode) : null;
      const fromMac = deviceMac
        ? resolveUnique(snByDeviceMac, deviceMac)
        : null;
      e.deviceSn = fromLink ?? fromMac ?? uniqueSn;
    }

    if (!hasMac) {
      const deviceSn = typeof e.deviceSn === 'string' ? e.deviceSn.trim() : '';
      const fromSn = deviceSn ? resolveUnique(macBySn, deviceSn) : null;
      e.deviceMac = fromSn ?? uniqueMac;
    }

    // Backfill linkCode so storage/http/mqtt/ack events can be grouped into a
    // single session timeline (best-effort, only when the mapping is unique).
    if (!hasLinkCode) {
      const deviceSn = typeof e.deviceSn === 'string' ? e.deviceSn.trim() : '';
      const deviceMac =
        typeof e.deviceMac === 'string' ? e.deviceMac.trim() : '';
      const fromSn = deviceSn ? resolveUnique(linkCodeBySn, deviceSn) : null;
      const fromMac = deviceMac
        ? resolveUnique(linkCodeByMac, deviceMac)
        : null;
      e.linkCode = fromSn ?? fromMac;
    }
  }
}

// Extract tracking fields from msg object for flow tracing
export function extractTrackingFields(msg: unknown): TrackingFields {
  const msgString = asString(msg);
  if (msgString !== undefined) {
    const trimmed = msgString.trim();
    if (trimmed.length === 0) return createEmptyTrackingFields();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        return extractTrackingFields(parsed);
      } catch {
        return createEmptyTrackingFields();
      }
    }
    return createEmptyTrackingFields();
  }

  const root = asRecord(msg);
  if (!root) return createEmptyTrackingFields();

  const result = createEmptyTrackingFields();

  const candidates: Record<string, unknown>[] = [root];
  const nestedData = asRecord(root.data);
  if (nestedData) candidates.push(nestedData);

  for (const obj of candidates) {
    if (!result.stage)
      result.stage = normalizeLowerTrim(pickFirstString(obj, ['stage']));
    if (!result.op)
      result.op = normalizeLowerTrim(pickFirstString(obj, ['op']));
    if (!result.result)
      result.result = normalizeLowerTrim(pickFirstString(obj, ['result']));

    if (!result.linkCode)
      result.linkCode = normalizeTrim(pickFirstString(obj, ['linkCode']));
    if (!result.requestId)
      result.requestId = normalizeTrim(
        pickFirstString(obj, ['requestId', 'msgId']),
      );
    if (!result.attemptId)
      result.attemptId = normalizeTrim(pickFirstString(obj, ['attemptId']));

    if (!result.deviceMac) {
      const mac = normalizeTrim(pickFirstString(obj, ['deviceMac', 'mac']));
      result.deviceMac = mac && looksLikeMac(mac) ? mac : null;
    }

    if (!result.deviceSn) {
      result.deviceSn = normalizeTrim(
        pickFirstString(obj, ['deviceSn', 'sn', 'serialNumber', 'serial']),
      );
      if (!result.deviceSn) {
        const topic = normalizeTrim(pickFirstString(obj, ['topic']));
        result.deviceSn = extractDeviceSnFromTopic(topic);
      }
      if (!result.deviceSn) {
        const url = normalizeTrim(pickFirstString(obj, ['url']));
        result.deviceSn = extractDeviceSnFromUrl(url);
      }
    }

    if (!result.errorCode) {
      const errorObj = asRecord(obj.error);
      const candidate =
        pickFirstString(obj, ['errorCode', 'code']) ??
        (errorObj
          ? pickFirstString(errorObj, ['errorCode', 'code'])
          : null);
      result.errorCode = normalizeTrim(candidate);
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
    private readonly analyzer?: LogsAnalyzerService,
  ) {}

  enqueue(logFileId: string) {
    void this.processLogFile(logFileId);
  }

  async processLogFile(logFileId: string, options?: { analyze?: boolean }) {
    const logFile = await this.prisma.logFile.findUnique({
      where: { id: logFileId },
    });
    if (!logFile) return;

    const analyze = options?.analyze ?? true;
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
      let loganStats: {
        blocksTotal: number;
        blocksSucceeded: number;
        blocksFailed: number;
      } | null = null;
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
          const cLower = outer.c.trim().toLowerCase();
          const nLower = (outer.n ?? '').trim().toLowerCase();
          if (
            cLower === 'clogan header' ||
            cLower === 'logan header' ||
            nLower === 'clogan' ||
            nLower === 'logan'
          ) {
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
            attemptId: tracking.attemptId,
            deviceMac: tracking.deviceMac,
            deviceSn: tracking.deviceSn,
            errorCode: tracking.errorCode,
            stage: tracking.stage,
            op: tracking.op,
            result: tracking.result,
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
            await tx.logEventStats.deleteMany({
              where: { logFileId: logFile.id },
            });
            await tx.logEvent.deleteMany({ where: { logFileId: logFile.id } });

            const batchSize = 500;
            for (let i = 0; i < events.length; i += batchSize) {
              const batch = events.slice(i, i + batchSize);
              if (batch.length === 0) continue;
              await tx.logEvent.createMany({ data: batch });
            }

            // Generate event statistics
            const statsMap = new Map<
              string,
              { eventName: string; level: number; count: number }
            >();
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
                parserVersion: 'v3',
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

      // Trigger automated analysis after successful parsing
      if (analyze && !hadError && this.analyzer) {
        try {
          await this.analyzer.analyzeLogFile(logFile.id);
        } catch {
          // Analyzer errors are persisted as AnalysisStatus.failed; keep parsing result intact.
        }
      }
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
