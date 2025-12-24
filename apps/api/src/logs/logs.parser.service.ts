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

// Extract tracking fields from msg object for flow tracing
function extractTrackingFields(msg: unknown): {
  linkCode: string | null;
  requestId: string | null;
  deviceMac: string | null;
  errorCode: string | null;
} {
  const result = {
    linkCode: null as string | null,
    requestId: null as string | null,
    deviceMac: null as string | null,
    errorCode: null as string | null,
  };

  if (!msg || typeof msg !== 'object') return result;

  const obj = msg as Record<string, unknown>;

  // Extract linkCode (APP session identifier)
  result.linkCode =
    asString(obj.linkCode) || asString(obj.link_code) || null;

  // Extract requestId (command chain identifier)
  result.requestId =
    asString(obj.requestId) || asString(obj.request_id) || null;

  // Extract deviceMac (device identifier)
  result.deviceMac =
    asString(obj.deviceMac) ||
    asString(obj.mac) ||
    asString(obj.device_mac) ||
    asString(obj.deviceId) ||
    null;

  // Extract errorCode
  const errorObj = obj.error;
  if (errorObj && typeof errorObj === 'object') {
    result.errorCode = asString((errorObj as Record<string, unknown>).code) || null;
  }
  if (!result.errorCode) {
    result.errorCode =
      asString(obj.errorCode) || asString(obj.error_code) || null;
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
      let text: string;
      if (this.loganDecrypt.isLoganEncrypted(buf)) {
        text = this.loganDecrypt.decrypt(buf);
      } else {
        text = buf.toString('utf8');
      }

      const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);

      const nowMs = BigInt(Date.now());
      const parserErrorEventName = 'PARSER_ERROR';

      const events: Prisma.LogEventCreateManyInput[] = [];
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

      const isGoneError = (e: unknown) =>
        e instanceof Prisma.PrismaClientKnownRequestError &&
        (e.code === 'P2025' || e.code === 'P2003');

      try {
        await this.prisma.$transaction(async (tx) => {
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
        });
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
        metadata: { lineCount: lines.length },
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
