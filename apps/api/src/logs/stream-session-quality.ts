type RecordLike = Record<string, unknown>;

function asRecord(x: unknown): RecordLike | null {
  if (!x || typeof x !== 'object') return null;
  return x as RecordLike;
}

function asString(x: unknown): string | undefined {
  if (typeof x === 'string') return x;
  return undefined;
}

function asNumber(x: unknown): number | undefined {
  if (typeof x === 'number' && Number.isFinite(x)) return x;
  if (typeof x === 'string') {
    const trimmed = x.trim();
    if (!trimmed) return undefined;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function asStringOrNumber(x: unknown): string | undefined {
  if (typeof x === 'string') return x;
  if (typeof x === 'number' && Number.isFinite(x)) return String(Math.trunc(x));
  if (typeof x === 'bigint') return x.toString();
  return undefined;
}

function pickFirstString(obj: RecordLike, keys: string[]): string | null {
  for (const key of keys) {
    const raw = asStringOrNumber(obj[key]);
    if (raw === undefined) continue;
    const value = raw.trim();
    if (value.length === 0) continue;
    return value;
  }
  return null;
}

function pickFirstNumber(obj: RecordLike, keys: string[]): number | null {
  for (const key of keys) {
    const value = asNumber(obj[key]);
    if (value === undefined) continue;
    return value;
  }
  return null;
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

function extractMessageText(msgJson: unknown): string {
  const s = asString(msgJson);
  if (s !== undefined) return s;

  const obj = asRecord(msgJson);
  if (obj) {
    const value = pickFirstString(obj, ['data', 'message', 'msg', 'text']);
    if (value) return value;
    try {
      return JSON.stringify(obj);
    } catch {
      return '[object]';
    }
  }

  if (msgJson === null || msgJson === undefined) return '';
  try {
    if (typeof msgJson === 'number' || typeof msgJson === 'boolean') {
      return String(msgJson);
    }
    if (typeof msgJson === 'bigint') return msgJson.toString();
    if (typeof msgJson === 'symbol') return msgJson.toString();
    if (typeof msgJson === 'function') {
      const name = msgJson.name ? ` ${msgJson.name}` : '';
      return `[function${name}]`;
    }
    return '';
  } catch {
    return '';
  }
}

type StreamSessionSummaryEvent = {
  timestampMs: number;
  deviceSn: string | null;
  linkCode: string | null;
  requestId: string | null;
  msgJson: unknown;
};

type StreamSessionQualityLevel = 'good' | 'warn' | 'bad';

export type StreamSessionQualityReport = {
  summary: {
    total: number;
    issuesMissingDeviceSn: number;
    issuesMissingLinkCode: number;
    issuesMissingRequestId: number;
    issuesMissingReason: number;
    issuesMissingSessionStartIndex: number;
    issuesMissingSessionStartAtMs: number;
    scoreAvg: number | null;
    qualityGood: number;
    qualityWarn: number;
    qualityBad: number;
    thresholdWarnBelow: number;
    thresholdBadBelow: number;
  };
  byReason: Array<{ reason: string; total: number }>;
  byDevice: Array<{ deviceSn: string; total: number }>;
  byLinkCode: Array<{ linkCode: string; total: number }>;
  byRequestId: Array<{ requestId: string; total: number }>;
  sessions: Array<{
    timestampMs: number;
    deviceSn: string | null;
    linkCode: string | null;
    requestId: string | null;
    reason: string | null;
    score: number;
    quality: StreamSessionQualityLevel;
    rawStartIndex: number | null;
    nextExpectedRaw: number | null;
    lastRaw: number | null;
    bufferedOutOfOrderCount: number | null;
    persistedMax: number | null;
    pendingCallbacks: number | null;
    sessionStartIndex: number | null;
    sessionStartAtMs: number | null;
    sessionElapsedMs: number | null;
  }>;
};

function normalizeKey(value: string | null | undefined): string {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function bumpCount(map: Map<string, number>, key: string) {
  const prev = map.get(key) ?? 0;
  map.set(key, prev + 1);
}

function clampInt(n: number, min: number, max: number) {
  return Math.min(Math.max(Math.trunc(n), min), max);
}

function scoreSession(params: {
  deviceSn: string | null;
  linkCode: string | null;
  requestId: string | null;
  reason: string | null;
  bufferedOutOfOrderCount: number | null;
  pendingCallbacks: number | null;
  persistedMax: number | null;
  lastRaw: number | null;
  nextExpectedRaw: number | null;
  sessionStartIndex: number | null;
  sessionStartAtMs: number | null;
}): number {
  let score = 100;

  if (!params.deviceSn) score -= 20;
  if (!params.linkCode) score -= 15;
  if (!params.requestId) score -= 15;
  if (!params.reason) score -= 10;
  if (params.sessionStartIndex === null) score -= 5;
  if (params.sessionStartAtMs === null) score -= 5;

  const reasonNorm = normalizeKey(params.reason).toLowerCase();
  if (reasonNorm === 'disconnectduetodataissue') score -= 30;
  if (reasonNorm === 'forcereleasefetchsession') score -= 20;
  if (reasonNorm === 'markdisconnected') score -= 10;

  const outOfOrder = params.bufferedOutOfOrderCount ?? 0;
  if (Number.isFinite(outOfOrder) && outOfOrder > 0) {
    score -= Math.min(30, Math.trunc(outOfOrder) * 2);
  }

  const pending = params.pendingCallbacks ?? 0;
  if (Number.isFinite(pending) && pending > 0) {
    score -= Math.min(20, Math.trunc(pending) * 5);
  }

  const persistedMax = params.persistedMax;
  const lastRaw = params.lastRaw;
  const nextExpectedRaw = params.nextExpectedRaw;
  if (persistedMax !== null) {
    let lag: number | null = null;
    if (lastRaw !== null) lag = lastRaw - persistedMax;
    else if (nextExpectedRaw !== null) lag = nextExpectedRaw - 1 - persistedMax;

    if (lag !== null && Number.isFinite(lag) && lag > 0) {
      score -= Math.min(25, Math.trunc(lag));
    }
  }

  return clampInt(score, 0, 100);
}

function classifyQuality(
  score: number,
  warnBelow: number,
  badBelow: number,
): StreamSessionQualityLevel {
  if (score < badBelow) return 'bad';
  if (score < warnBelow) return 'warn';
  return 'good';
}

function extractFields(msgJson: unknown) {
  const obj = asRecord(msgJson);
  const tokensObj = parseKeyValueTokens(
    extractMessageText(msgJson),
  ) as RecordLike;

  const getString = (keys: string[]) =>
    (obj ? pickFirstString(obj, keys) : null) ??
    pickFirstString(tokensObj, keys);
  const getNumber = (keys: string[]) =>
    (obj ? pickFirstNumber(obj, keys) : null) ??
    pickFirstNumber(tokensObj, keys);

  const reason =
    getString(['reason', 'closeReason', 'sessionReason']) ??
    getString(['session_close_reason', 'session_reason']);

  const rawStartIndex = getNumber(['rawStartIndex', 'raw_start_index']);
  const nextExpectedRaw = getNumber(['nextExpectedRaw', 'next_expected_raw']);
  const lastRaw = getNumber(['lastRaw', 'last_raw']);
  const bufferedOutOfOrderCount = getNumber([
    'bufferedOutOfOrderCount',
    'buffered_out_of_order_count',
  ]);
  const persistedMax = getNumber(['persistedMax', 'persisted_max']);
  const pendingCallbacks = getNumber(['pendingCallbacks', 'pending_callbacks']);

  const sessionStartIndex = getNumber([
    'sessionStartIndex',
    'session_start_index',
  ]);
  const sessionStartAtMs = getNumber([
    'sessionStartAtMs',
    'session_start_at_ms',
  ]);
  const sessionElapsedMs = getNumber([
    'sessionElapsedMs',
    'session_elapsed_ms',
  ]);

  return {
    reason,
    rawStartIndex,
    nextExpectedRaw,
    lastRaw,
    bufferedOutOfOrderCount,
    persistedMax,
    pendingCallbacks,
    sessionStartIndex,
    sessionStartAtMs,
    sessionElapsedMs,
  };
}

export function buildStreamSessionQualityReport(params: {
  events: StreamSessionSummaryEvent[];
  topLimit?: number;
  sessionsLimit?: number;
  warnBelow?: number;
  badBelow?: number;
}): StreamSessionQualityReport {
  const topLimit = params.topLimit ?? 10;
  const sessionsLimit = params.sessionsLimit ?? 20;
  const warnBelow = clampInt(params.warnBelow ?? 80, 0, 100);
  const badBelow = clampInt(params.badBelow ?? 60, 0, warnBelow);

  const summary = {
    total: 0,
    issuesMissingDeviceSn: 0,
    issuesMissingLinkCode: 0,
    issuesMissingRequestId: 0,
    issuesMissingReason: 0,
    issuesMissingSessionStartIndex: 0,
    issuesMissingSessionStartAtMs: 0,
    scoreAvg: null as number | null,
    qualityGood: 0,
    qualityWarn: 0,
    qualityBad: 0,
    thresholdWarnBelow: warnBelow,
    thresholdBadBelow: badBelow,
  };

  const byReason = new Map<string, number>();
  const byDevice = new Map<string, number>();
  const byLinkCode = new Map<string, number>();
  const byRequestId = new Map<string, number>();

  const sessions: StreamSessionQualityReport['sessions'] = [];
  let scoreSum = 0;

  for (const e of params.events) {
    summary.total += 1;

    const sn = normalizeKey(e.deviceSn);
    const linkCode = normalizeKey(e.linkCode);
    const requestId = normalizeKey(e.requestId);

    if (!sn) summary.issuesMissingDeviceSn += 1;
    else bumpCount(byDevice, sn);

    if (!linkCode) summary.issuesMissingLinkCode += 1;
    else bumpCount(byLinkCode, linkCode);

    if (!requestId) summary.issuesMissingRequestId += 1;
    else bumpCount(byRequestId, requestId);

    const fields = extractFields(e.msgJson);

    const reason = normalizeKey(fields.reason);
    if (!reason) summary.issuesMissingReason += 1;
    else bumpCount(byReason, reason);

    if (fields.sessionStartIndex === null)
      summary.issuesMissingSessionStartIndex += 1;
    if (fields.sessionStartAtMs === null)
      summary.issuesMissingSessionStartAtMs += 1;

    const score = scoreSession({
      deviceSn: sn || null,
      linkCode: linkCode || null,
      requestId: requestId || null,
      reason: reason || null,
      bufferedOutOfOrderCount: fields.bufferedOutOfOrderCount,
      pendingCallbacks: fields.pendingCallbacks,
      persistedMax: fields.persistedMax,
      lastRaw: fields.lastRaw,
      nextExpectedRaw: fields.nextExpectedRaw,
      sessionStartIndex: fields.sessionStartIndex,
      sessionStartAtMs: fields.sessionStartAtMs,
    });
    scoreSum += score;
    const quality = classifyQuality(score, warnBelow, badBelow);
    if (quality === 'good') summary.qualityGood += 1;
    if (quality === 'warn') summary.qualityWarn += 1;
    if (quality === 'bad') summary.qualityBad += 1;

    sessions.push({
      timestampMs: e.timestampMs,
      deviceSn: sn || null,
      linkCode: linkCode || null,
      requestId: requestId || null,
      reason: reason || null,
      score,
      quality,
      rawStartIndex: fields.rawStartIndex,
      nextExpectedRaw: fields.nextExpectedRaw,
      lastRaw: fields.lastRaw,
      bufferedOutOfOrderCount: fields.bufferedOutOfOrderCount,
      persistedMax: fields.persistedMax,
      pendingCallbacks: fields.pendingCallbacks,
      sessionStartIndex: fields.sessionStartIndex,
      sessionStartAtMs: fields.sessionStartAtMs,
      sessionElapsedMs: fields.sessionElapsedMs,
    });
  }

  summary.scoreAvg =
    summary.total > 0 ? Math.round(scoreSum / summary.total) : null;

  const sortEntries = (m: Map<string, number>) =>
    Array.from(m.entries())
      .map(([key, total]) => ({ key, total }))
      .sort((a, b) =>
        b.total !== a.total ? b.total - a.total : a.key.localeCompare(b.key),
      );

  const sessionRows = [...sessions]
    .sort((a, b) =>
      b.timestampMs !== a.timestampMs ? b.timestampMs - a.timestampMs : 0,
    )
    .slice(0, sessionsLimit);

  return {
    summary,
    byReason: sortEntries(byReason)
      .slice(0, topLimit)
      .map((r) => ({ reason: r.key, total: r.total })),
    byDevice: sortEntries(byDevice)
      .slice(0, topLimit)
      .map((r) => ({ deviceSn: r.key, total: r.total })),
    byLinkCode: sortEntries(byLinkCode)
      .slice(0, topLimit)
      .map((r) => ({ linkCode: r.key, total: r.total })),
    byRequestId: sortEntries(byRequestId)
      .slice(0, topLimit)
      .map((r) => ({ requestId: r.key, total: r.total })),
    sessions: sessionRows,
  };
}
