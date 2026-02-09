import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { LoganDecryptService } from '../logs/logan-decrypt.service';
import {
  extractTrackingFields,
  type TrackingFields,
} from '../logs/logs.parser.service';

type NormalizedEvent = {
  timestampMs: number;
  level: number;
  eventName: string;
  msg: unknown;
  tracking: TrackingFields;
};

type Filters = {
  deviceSn?: string;
  deviceMac?: string;
  linkCode?: string;
  attemptId?: string;
  requestId?: string;
};

function usage(): string {
  return [
    'Usage:',
    '  npm --prefix apps/api run logs:quick-trace -- --file <path> [--deviceSn <sn>] [--linkCode <lc>] [--attemptId <id>] [--requestId <id>] [--deviceMac <mac>] [--limit <n>]',
    '',
    'Examples:',
    '  npm --prefix apps/api run logs:quick-trace -- --file ./decoded.jsonl',
    '  npm --prefix apps/api run logs:quick-trace -- --file ./logan.bin --deviceSn SN123',
    '',
    'Notes:',
    '  - Supports decoded JSONL and Logan encrypted binary files.',
    '  - For Logan encrypted files, set env: LOGAN_DECRYPT_KEY / LOGAN_DECRYPT_IV.',
  ].join('\n');
}

function parseArgs(argv: string[]): {
  file: string;
  limit: number;
  filters: Filters;
} {
  const args = [...argv];
  const filters: Filters = {};
  let file = '';
  let limit = 200_000;

  const take = () => args.shift();
  while (args.length > 0) {
    const a = take();
    if (!a) break;

    if (a === '--file') {
      file = (take() ?? '').trim();
      continue;
    }

    if (a === '--limit') {
      const raw = (take() ?? '').trim();
      const n = Number(raw);
      if (Number.isFinite(n) && n > 0) limit = Math.trunc(n);
      continue;
    }

    if (a === '--deviceSn') {
      filters.deviceSn = (take() ?? '').trim();
      continue;
    }
    if (a === '--deviceMac') {
      filters.deviceMac = (take() ?? '').trim();
      continue;
    }
    if (a === '--linkCode') {
      filters.linkCode = (take() ?? '').trim();
      continue;
    }
    if (a === '--attemptId') {
      filters.attemptId = (take() ?? '').trim();
      continue;
    }
    if (a === '--requestId') {
      filters.requestId = (take() ?? '').trim();
      continue;
    }

    if (a === '-h' || a === '--help') {
      throw new Error(usage());
    }

    // First positional arg as file path
    if (!a.startsWith('-') && !file) {
      file = a.trim();
      continue;
    }
  }

  if (!file) throw new Error(usage());
  return { file, limit, filters };
}

function asRecord(x: unknown): Record<string, unknown> | null {
  if (!x || typeof x !== 'object') return null;
  return x as Record<string, unknown>;
}

function normalizeMsg(msg: unknown): unknown {
  if (typeof msg !== 'string') return msg;
  const trimmed = msg.trim();
  if (trimmed.length < 2) return msg;
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      return JSON.parse(trimmed) as unknown;
    } catch {
      return msg;
    }
  }
  return msg;
}

function pickString(msg: unknown, keys: string[]): string | null {
  const root = asRecord(msg);
  if (!root) return null;
  const candidates: Record<string, unknown>[] = [root];
  const nested = asRecord(root.data);
  if (nested) candidates.push(nested);
  for (const obj of candidates) {
    for (const k of keys) {
      const v = obj[k];
      if (typeof v === 'string' && v.trim().length > 0) return v.trim();
      if (typeof v === 'number' && Number.isFinite(v)) return String(v);
    }
  }
  return null;
}

function matchByFilters(e: NormalizedEvent, filters: Filters): boolean {
  const t = e.tracking;
  if (filters.deviceSn && t.deviceSn !== filters.deviceSn) return false;
  if (filters.deviceMac && t.deviceMac !== filters.deviceMac) return false;
  if (filters.linkCode && t.linkCode !== filters.linkCode) return false;
  if (filters.attemptId && t.attemptId !== filters.attemptId) return false;
  if (filters.requestId && t.requestId !== filters.requestId) return false;
  return true;
}

function isHeaderLine(outerC: string, outerN: string | undefined): boolean {
  const cLower = outerC.trim().toLowerCase();
  const nLower = (outerN ?? '').trim().toLowerCase();
  return (
    cLower === 'clogan header' ||
    cLower === 'logan header' ||
    nLower === 'clogan' ||
    nLower === 'logan'
  );
}

function parseLogBuffer(buf: Buffer, limit: number): NormalizedEvent[] {
  const decrypt = new LoganDecryptService();
  const text = decrypt.isLoganEncrypted(buf)
    ? decrypt.decrypt(buf).text
    : buf.toString('utf8');
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);

  const out: NormalizedEvent[] = [];
  for (const line of lines) {
    if (out.length >= limit) break;
    try {
      const outerRaw = JSON.parse(line) as unknown;
      const outer = asRecord(outerRaw);
      if (!outer) continue;
      const c = typeof outer.c === 'string' ? outer.c : '';
      const f = typeof outer.f === 'number' ? outer.f : 0;
      const l = typeof outer.l === 'number' ? outer.l : 0;
      const n = typeof outer.n === 'string' ? outer.n : undefined;
      if (!c || !f || !l) continue;
      if (isHeaderLine(c, n)) continue;

      const innerRaw = JSON.parse(c) as unknown;
      const inner = asRecord(innerRaw);
      if (!inner) continue;
      const eventName = typeof inner.event === 'string' ? inner.event : '';
      if (!eventName) continue;

      const msg = normalizeMsg(inner.msg);
      out.push({
        timestampMs: Math.trunc(l),
        level: Math.trunc(f),
        eventName,
        msg,
        tracking: extractTrackingFields(msg),
      });
    } catch {
      // ignore bad lines in CLI mode
    }
  }

  out.sort((a, b) => a.timestampMs - b.timestampMs);
  return out;
}

function fmtDeltaMs(ms: number | null): string {
  if (ms === null) return '-';
  if (ms < 0) return '-';
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(3)}s`;
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}m${r.toFixed(3)}s`;
}

function groupKey(e: NormalizedEvent): string {
  const t = e.tracking;
  return (
    t.attemptId ||
    t.linkCode ||
    t.requestId ||
    t.deviceSn ||
    t.deviceMac ||
    'unknown'
  );
}

function pickMilestones(events: NormalizedEvent[]) {
  const firstTs = events[0]?.timestampMs ?? 0;
  const lastTs = events[events.length - 1]?.timestampMs ?? 0;

  const findFirst = (pred: (e: NormalizedEvent) => boolean): number | null => {
    for (const e of events) if (pred(e)) return e.timestampMs;
    return null;
  };

  const connectStart = findFirst(
    (e) =>
      e.tracking.stage === 'ble' &&
      e.tracking.op === 'connect' &&
      e.tracking.result === 'start',
  );
  const authOk = findFirst(
    (e) =>
      e.tracking.stage === 'ble' &&
      e.tracking.op === 'auth' &&
      e.tracking.result === 'ok',
  );
  const readyOk = findFirst((e) => {
    if (e.tracking.stage !== 'ble') return false;
    const reason = pickString(e.msg, ['reasonCode', 'reason_code']);
    return reason === 'READY';
  });
  const getDataStart = findFirst(
    (e) =>
      e.tracking.stage === 'ble' &&
      e.tracking.op === 'getdata' &&
      e.tracking.result === 'start',
  );
  const historyDone = findFirst(
    (e) =>
      e.tracking.stage === 'ble' &&
      e.tracking.op === 'receivedata' &&
      e.tracking.result === 'ok',
  );
  const stallTimeout = findFirst(
    (e) => e.tracking.errorCode === 'DATA_STREAM_STALL_TIMEOUT',
  );
  const persistTimeout = findFirst(
    (e) => e.tracking.errorCode === 'DATA_PERSIST_TIMEOUT',
  );
  const indexGapBlocked = findFirst(
    (e) => e.tracking.errorCode === 'INDEX_GAP_BLOCKED',
  );

  const publishStart = findFirst(
    (e) =>
      e.tracking.stage === 'mqtt' &&
      e.tracking.op === 'publish' &&
      e.tracking.result === 'start',
  );
  const publishOk = findFirst(
    (e) =>
      e.tracking.stage === 'mqtt' &&
      e.tracking.op === 'publish' &&
      e.tracking.result === 'ok',
  );
  const ackOk = findFirst(
    (e) =>
      e.tracking.stage === 'mqtt' &&
      e.tracking.op === 'ack' &&
      e.tracking.result === 'ok',
  );
  const ackTimeout = findFirst(
    (e) =>
      (e.tracking.stage === 'mqtt' &&
        e.tracking.op === 'ack' &&
        e.tracking.result === 'timeout') ||
      e.tracking.errorCode === 'ACK_TIMEOUT',
  );
  const ackPending = findFirst((e) => e.tracking.errorCode === 'ACK_PENDING');

  return {
    firstTs,
    lastTs,
    durationMs: lastTs > 0 && firstTs > 0 ? lastTs - firstTs : null,
    connectStart,
    authOk,
    readyOk,
    getDataStart,
    historyDone,
    publishStart,
    publishOk,
    ackOk,
    ackTimeout,
    ackPending,
    stallTimeout,
    persistTimeout,
    indexGapBlocked,
  };
}

function main() {
  const { file, limit, filters } = parseArgs(process.argv.slice(2));
  const abs = resolve(file);
  const buf = readFileSync(abs);
  const all = parseLogBuffer(buf, limit);
  const events = all.filter((e) => matchByFilters(e, filters));

  if (events.length === 0) {
    // still show top-level hint
    console.log(`No events matched filters. parsed=${all.length}`);
    return;
  }

  const byGroup = new Map<string, NormalizedEvent[]>();
  for (const e of events) {
    const k = groupKey(e);
    const arr = byGroup.get(k) ?? [];
    arr.push(e);
    byGroup.set(k, arr);
  }

  const groups = Array.from(byGroup.entries())
    .map(([k, evs]) => ({
      key: k,
      events: evs.sort((a, b) => a.timestampMs - b.timestampMs),
    }))
    .sort((a, b) => (b.events.length ?? 0) - (a.events.length ?? 0));

  console.log(
    `parsed=${all.length} matched=${events.length} groups=${groups.length}`,
  );

  // Top errorCode stats
  const errorCodeCount = new Map<string, number>();
  for (const e of events) {
    const code = e.tracking.errorCode;
    if (!code) continue;
    errorCodeCount.set(code, (errorCodeCount.get(code) ?? 0) + 1);
  }
  const topCodes = Array.from(errorCodeCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);
  if (topCodes.length > 0) {
    console.log('topErrorCode:');
    for (const [code, cnt] of topCodes) {
      console.log(`  ${code} x${cnt}`);
    }
  }

  console.log('\nSessions (top 20):');
  for (const g of groups.slice(0, 20)) {
    const m = pickMilestones(g.events);
    const sample = g.events.find(
      (e) => e.tracking.deviceSn || e.tracking.deviceMac || e.tracking.linkCode,
    );
    const t = sample?.tracking ?? ({} as TrackingFields);
    const status = m.ackOk
      ? 'ack_ok'
      : m.ackTimeout
        ? 'ack_timeout'
        : m.stallTimeout
          ? 'stall_timeout'
          : m.persistTimeout
            ? 'persist_timeout'
            : m.indexGapBlocked
              ? 'index_gap_blocked'
              : 'incomplete';

    const sinceConnect = (ts: number | null) =>
      ts === null || m.connectStart === null ? null : ts - m.connectStart;

    console.log(
      [
        `- key=${g.key}`,
        t.deviceSn ? `sn=${t.deviceSn}` : '',
        t.deviceMac ? `mac=${t.deviceMac}` : '',
        t.linkCode ? `linkCode=${t.linkCode}` : '',
        t.requestId ? `requestId=${t.requestId}` : '',
        `events=${g.events.length}`,
        `status=${status}`,
        `dur=${fmtDeltaMs(m.durationMs)}`,
        `auth=${fmtDeltaMs(sinceConnect(m.authOk))}`,
        `ready=${fmtDeltaMs(sinceConnect(m.readyOk))}`,
        `getData=${fmtDeltaMs(sinceConnect(m.getDataStart))}`,
        `done=${fmtDeltaMs(sinceConnect(m.historyDone))}`,
        `publish=${fmtDeltaMs(sinceConnect(m.publishStart))}`,
        `ack=${fmtDeltaMs(sinceConnect(m.ackOk ?? m.ackTimeout))}`,
      ]
        .filter((x) => x.length > 0)
        .join(' '),
    );
  }

  console.log(
    '\nTip: add --attemptId/--linkCode/--deviceSn to narrow down and re-run.',
  );
}

try {
  main();
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  // Print usage when no args
  console.error(msg);
  process.exitCode = 1;
}
