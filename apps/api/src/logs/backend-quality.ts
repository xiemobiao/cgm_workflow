export type BackendQualityHttpSummary = {
  total: number;
  success: number;
  failed: number;
  missingEnd: number;
  tookMsAvg: number | null;
  tookMsP95: number | null;
};

export type BackendQualityMqttSummary = {
  uploadBatchSent: number;
  uploadSkippedNotConnected: number;
  publishSuccess: number;
  publishFailed: number;
  ackSuccess: number;
  ackFailed: number;
  ackTimeout: number;
  subscribeFailed: number;
  issuesMissingDeviceSn: number;
  disconnected: number;
  connected: number;
};

export type BackendQualityReport = {
  summary: {
    http: BackendQualityHttpSummary;
    mqtt: BackendQualityMqttSummary;
  };
  http: {
    endpoints: Array<{
      method: string | null;
      path: string;
      total: number;
      success: number;
      failed: number;
    }>;
    failedRequests: Array<{
      requestId: string;
      timestampMs: number;
      method: string | null;
      url: string | null;
      statusCode: number | null;
      tookMs: number | null;
    }>;
    missingEndRequests: Array<{
      requestId: string;
      startTimestampMs: number;
      method: string | null;
      url: string | null;
    }>;
  };
  mqtt: {
    issuesByDevice: Array<{
      deviceSn: string;
      uploadSkippedNotConnected: number;
      publishFailed: number;
      ackFailed: number;
      ackTimeout: number;
    }>;
    ackTimeouts: Array<{
      timestampMs: number;
      deviceSn: string | null;
      msgId: string | null;
      message: string;
    }>;
    publishFailures: Array<{
      timestampMs: number;
      deviceSn: string | null;
      msgId: string | null;
      topic: string | null;
      message: string;
    }>;
  };
};

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
    const n = Number(x);
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

function normalizeDeviceSnCandidate(value: string | null | undefined): string | null {
  if (!value) return null;
  let t = value.trim();
  if (!t) return null;
  t = t.replace(/^[\"'([{<]+/, '').replace(/[\"')\]}>]+$/, '');
  t = t.replace(/[,:;]+$/, '').trim();
  return t ? t.slice(0, 128) : null;
}

function extractDeviceSnFromTopic(topic: string | null): string | null {
  if (!topic) return null;
  const t = topic.trim();
  if (!t) return null;

  const prefixes = ['data/', 'data_reply/'];
  for (const p of prefixes) {
    if (!t.startsWith(p)) continue;
    const rest = t.slice(p.length).trim();
    if (!rest) continue;
    const firstSegment = (rest.split('/')[0] ?? '').trim();
    return normalizeDeviceSnCandidate(firstSegment);
  }

  return null;
}

function extractMessageText(msgJson: unknown): string {
  const s = asString(msgJson);
  if (s !== undefined) return s;

  const obj = asRecord(msgJson);
  if (obj) {
    const value =
      pickFirstString(obj, ['data', 'message', 'msg', 'text']) ?? null;
    if (value) return value;
    try {
      return JSON.stringify(obj);
    } catch {
      return '[object]';
    }
  }

  if (msgJson === null || msgJson === undefined) return '';
  try {
    return String(msgJson);
  } catch {
    return '';
  }
}

function normalizeUrlPath(url: string | null): string {
  if (!url) return '(unknown)';
  try {
    const u = new URL(url);
    return u.pathname || '/';
  } catch {
    const noQuery = url.split('?')[0] ?? url;
    return noQuery.trim() || '(unknown)';
  }
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(Math.max(Math.ceil((p / 100) * sorted.length) - 1, 0), sorted.length - 1);
  const v = sorted[idx];
  return Number.isFinite(v) ? v : null;
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  const sum = values.reduce((a, b) => a + b, 0);
  return Number.isFinite(sum) ? sum / values.length : null;
}

type HttpEventRow = {
  timestampMs: number;
  eventName: string;
  requestId: string | null;
  msgJson: unknown;
};

type MqttEventRow = {
  timestampMs: number;
  eventName: string;
  deviceSn: string | null;
  requestId: string | null;
  errorCode: string | null;
  msgJson: unknown;
};

type HttpAgg = {
  requestId: string;
  method: string | null;
  url: string | null;
  startTimestampMs: number | null;
  successTimestampMs: number | null;
  failedTimestampMs: number | null;
  statusCode: number | null;
  tookMs: number | null;
  hasSuccess: boolean;
  hasFailure: boolean;
};

type MqttKind =
  | 'uploadBatchSent'
  | 'uploadSkippedNotConnected'
  | 'publishSuccess'
  | 'publishFailed'
  | 'ackSuccess'
  | 'ackFailed'
  | 'ackTimeout'
  | 'subscribeFailed'
  | 'connected'
  | 'disconnected'
  | 'other';

type ExtractedMqttFields = {
  text: string;
  stage: string | null;
  op: string | null;
  result: string | null;
  msgId: string | null;
  topic: string | null;
  deviceSnCandidate: string | null;
};

function extractMqttFields(msgJson: unknown): ExtractedMqttFields {
  const text = extractMessageText(msgJson);

  const root = asRecord(msgJson);
  const candidates: RecordLike[] = [];
  if (root) candidates.push(root);
  const nestedData = root ? asRecord(root.data) : null;
  if (nestedData) candidates.push(nestedData);

  let stage: string | null = null;
  let op: string | null = null;
  let result: string | null = null;
  let msgId: string | null = null;
  let topic: string | null = null;
  let deviceSnCandidate: string | null = null;

  for (const obj of candidates) {
    if (!stage) {
      const raw = pickFirstString(obj, ['stage']);
      stage = raw ? raw.trim().toLowerCase() : null;
    }
    if (!op) {
      const raw = pickFirstString(obj, ['op']);
      op = raw ? raw.trim().toLowerCase() : null;
    }
    if (!result) {
      const raw = pickFirstString(obj, ['result']);
      result = raw ? raw.trim().toLowerCase() : null;
    }
    if (!msgId) {
      msgId = pickFirstString(obj, ['msgId']) ?? null;
    }
    if (!topic) {
      topic = pickFirstString(obj, ['topic']) ?? null;
    }
    if (!deviceSnCandidate) {
      const raw = pickFirstString(obj, ['deviceSn']) ?? null;
      deviceSnCandidate =
        normalizeDeviceSnCandidate(raw) ?? extractDeviceSnFromTopic(topic);
    }
  }

  return {
    text,
    stage,
    op,
    result,
    msgId,
    topic,
    deviceSnCandidate,
  };
}

function classifyMqttMessage(fields: ExtractedMqttFields, errorCode: string | null): {
  kind: MqttKind;
  msgId: string | null;
  topic: string | null;
  deviceSnCandidate: string | null;
} {
  const { stage, op, result, msgId, topic, deviceSnCandidate } = fields;
  const err = errorCode ? errorCode.trim() : '';

  if (stage !== 'mqtt' || !op || !result) {
    return { kind: 'other', msgId, topic, deviceSnCandidate };
  }

  if (op === 'publish') {
    if (result === 'start') {
      return { kind: 'uploadBatchSent', msgId, topic, deviceSnCandidate };
    }
    if (result === 'ok') {
      return { kind: 'publishSuccess', msgId, topic, deviceSnCandidate };
    }
    if (result === 'fail') {
      return { kind: 'publishFailed', msgId, topic, deviceSnCandidate };
    }
    if (result === 'skip') {
      return { kind: 'uploadSkippedNotConnected', msgId, topic, deviceSnCandidate };
    }
    return { kind: 'other', msgId, topic, deviceSnCandidate };
  }

  if (op === 'ack') {
    if (result === 'timeout' || err === 'ACK_TIMEOUT') {
      return { kind: 'ackTimeout', msgId, topic, deviceSnCandidate };
    }
    if (result === 'ok') {
      return { kind: 'ackSuccess', msgId, topic, deviceSnCandidate };
    }
    if (result === 'fail') {
      return { kind: 'ackFailed', msgId, topic, deviceSnCandidate };
    }
    return { kind: 'other', msgId, topic, deviceSnCandidate };
  }

  if (op === 'subscribe') {
    if (result === 'fail') {
      return { kind: 'subscribeFailed', msgId, topic, deviceSnCandidate };
    }
    return { kind: 'other', msgId, topic, deviceSnCandidate };
  }

  if (op === 'connect') {
    if (result === 'ok') {
      return { kind: 'connected', msgId, topic, deviceSnCandidate };
    }
    if (result === 'fail') {
      return { kind: 'disconnected', msgId, topic, deviceSnCandidate };
    }
    return { kind: 'other', msgId, topic, deviceSnCandidate };
  }

  return { kind: 'other', msgId, topic, deviceSnCandidate };
}

export function buildBackendQualityReport(params: {
  httpEvents: HttpEventRow[];
  mqttEvents: MqttEventRow[];
  listLimit?: number;
}): BackendQualityReport {
  const listLimit = Math.min(Math.max(params.listLimit ?? 50, 1), 200);

  // ========== HTTP ==========
  const httpById = new Map<string, HttpAgg>();

  for (const e of params.httpEvents) {
    const requestId = (e.requestId ?? '').trim();
    if (!requestId) continue;

    const msgObj = asRecord(e.msgJson);
    const method =
      (msgObj ? pickFirstString(msgObj, ['method']) : null) ?? null;
    const url = (msgObj ? pickFirstString(msgObj, ['url', 'requestUrl']) : null) ?? null;
    const statusCode = msgObj ? asNumber(msgObj.statusCode) ?? null : null;
    const tookMs = msgObj ? asNumber(msgObj.tookMs) ?? null : null;

    const agg: HttpAgg = httpById.get(requestId) ?? {
      requestId,
      method: null,
      url: null,
      startTimestampMs: null,
      successTimestampMs: null,
      failedTimestampMs: null,
      statusCode: null,
      tookMs: null,
      hasSuccess: false,
      hasFailure: false,
    };

    if (!agg.method && method) agg.method = method;
    if (!agg.url && url) agg.url = url;

    if (e.eventName === 'network_request_start') {
      if (agg.startTimestampMs === null || e.timestampMs < agg.startTimestampMs) {
        agg.startTimestampMs = e.timestampMs;
      }
    } else if (e.eventName === 'network_request_success') {
      agg.hasSuccess = true;
      if (agg.successTimestampMs === null || e.timestampMs > agg.successTimestampMs) {
        agg.successTimestampMs = e.timestampMs;
      }
      if (statusCode !== null) agg.statusCode = statusCode;
      if (tookMs !== null) agg.tookMs = tookMs;
    } else if (e.eventName === 'network_request_failed') {
      agg.hasFailure = true;
      if (agg.failedTimestampMs === null || e.timestampMs > agg.failedTimestampMs) {
        agg.failedTimestampMs = e.timestampMs;
      }
      if (statusCode !== null) agg.statusCode = statusCode;
      if (tookMs !== null) agg.tookMs = tookMs;
    }

    httpById.set(requestId, agg);
  }

  let httpSuccess = 0;
  let httpFailed = 0;
  let httpMissingEnd = 0;
  const httpTookValues: number[] = [];
  const endpointAgg = new Map<string, { method: string | null; path: string; total: number; success: number; failed: number }>();
  const failedRequests: BackendQualityReport['http']['failedRequests'] = [];
  const missingEndRequests: BackendQualityReport['http']['missingEndRequests'] = [];

  for (const agg of httpById.values()) {
    const totalKey = `${agg.method ?? ''} ${normalizeUrlPath(agg.url)}`;
    const endpoint = endpointAgg.get(totalKey) ?? {
      method: agg.method,
      path: normalizeUrlPath(agg.url),
      total: 0,
      success: 0,
      failed: 0,
    };
    endpoint.total += 1;

    if (agg.hasSuccess) {
      httpSuccess += 1;
      endpoint.success += 1;
      if (typeof agg.tookMs === 'number' && Number.isFinite(agg.tookMs)) httpTookValues.push(agg.tookMs);
    } else if (agg.hasFailure) {
      httpFailed += 1;
      endpoint.failed += 1;
      if (typeof agg.tookMs === 'number' && Number.isFinite(agg.tookMs)) httpTookValues.push(agg.tookMs);
      failedRequests.push({
        requestId: agg.requestId,
        timestampMs: agg.failedTimestampMs ?? agg.startTimestampMs ?? 0,
        method: agg.method,
        url: agg.url,
        statusCode: agg.statusCode,
        tookMs: agg.tookMs,
      });
    } else {
      httpMissingEnd += 1;
      missingEndRequests.push({
        requestId: agg.requestId,
        startTimestampMs: agg.startTimestampMs ?? 0,
        method: agg.method,
        url: agg.url,
      });
    }

    endpointAgg.set(totalKey, endpoint);
  }

  const endpoints = Array.from(endpointAgg.values()).sort((a, b) => b.failed - a.failed || b.total - a.total).slice(0, 20);
  const failedRequestsTop = failedRequests.sort((a, b) => b.timestampMs - a.timestampMs).slice(0, listLimit);
  const missingEndTop = missingEndRequests.sort((a, b) => b.startTimestampMs - a.startTimestampMs).slice(0, listLimit);

  // ========== MQTT ==========
  const mqttSummary: BackendQualityMqttSummary = {
    uploadBatchSent: 0,
    uploadSkippedNotConnected: 0,
    publishSuccess: 0,
    publishFailed: 0,
    ackSuccess: 0,
    ackFailed: 0,
    ackTimeout: 0,
    subscribeFailed: 0,
    issuesMissingDeviceSn: 0,
    disconnected: 0,
    connected: 0,
  };

  const issuesByDevice = new Map<string, { deviceSn: string; uploadSkippedNotConnected: number; publishFailed: number; ackFailed: number; ackTimeout: number }>();
  const ackTimeouts: BackendQualityReport['mqtt']['ackTimeouts'] = [];
  const publishFailures: BackendQualityReport['mqtt']['publishFailures'] = [];

  for (const e of params.mqttEvents) {
    const fields = extractMqttFields(e.msgJson);
    if (!fields.text) continue;

    const { kind, msgId, topic, deviceSnCandidate } = classifyMqttMessage(fields, e.errorCode);
    const text = fields.text;

    const deviceSn =
      normalizeDeviceSnCandidate(e.deviceSn) ?? deviceSnCandidate ?? null;

    const isIssueKind =
      kind === 'uploadSkippedNotConnected' ||
      kind === 'publishFailed' ||
      kind === 'ackFailed' ||
      kind === 'ackTimeout' ||
      kind === 'subscribeFailed';
    if (isIssueKind && !deviceSn) mqttSummary.issuesMissingDeviceSn += 1;

    const deviceKey = deviceSn ?? '(unknown)';
    const acc = issuesByDevice.get(deviceKey) ?? {
      deviceSn: deviceSn ?? '(unknown)',
      uploadSkippedNotConnected: 0,
      publishFailed: 0,
      ackFailed: 0,
      ackTimeout: 0,
    };

    switch (kind) {
      case 'uploadBatchSent':
        mqttSummary.uploadBatchSent += 1;
        break;
      case 'uploadSkippedNotConnected':
        mqttSummary.uploadSkippedNotConnected += 1;
        acc.uploadSkippedNotConnected += 1;
        break;
      case 'publishSuccess':
        mqttSummary.publishSuccess += 1;
        break;
      case 'publishFailed':
        mqttSummary.publishFailed += 1;
        acc.publishFailed += 1;
        publishFailures.push({
          timestampMs: e.timestampMs,
          deviceSn,
          msgId: msgId ?? (e.requestId ?? null),
          topic,
          message: text,
        });
        break;
      case 'ackSuccess':
        mqttSummary.ackSuccess += 1;
        break;
      case 'ackFailed':
        mqttSummary.ackFailed += 1;
        acc.ackFailed += 1;
        break;
      case 'ackTimeout':
        mqttSummary.ackTimeout += 1;
        acc.ackTimeout += 1;
        ackTimeouts.push({
          timestampMs: e.timestampMs,
          deviceSn,
          msgId: msgId ?? (e.requestId ?? null),
          message: text,
        });
        break;
      case 'subscribeFailed':
        mqttSummary.subscribeFailed += 1;
        break;
      case 'connected':
        mqttSummary.connected += 1;
        break;
      case 'disconnected':
        mqttSummary.disconnected += 1;
        break;
      default:
        break;
    }

    issuesByDevice.set(deviceKey, acc);
  }

  const issuesByDeviceTop = Array.from(issuesByDevice.values())
    .filter((d) => d.deviceSn !== '(unknown)')
    .sort(
      (a, b) =>
        (b.ackTimeout + b.ackFailed + b.publishFailed + b.uploadSkippedNotConnected) -
          (a.ackTimeout + a.ackFailed + a.publishFailed + a.uploadSkippedNotConnected) ||
        b.ackTimeout - a.ackTimeout,
    )
    .slice(0, 20);

  const ackTimeoutsTop = ackTimeouts.sort((a, b) => b.timestampMs - a.timestampMs).slice(0, listLimit);
  const publishFailuresTop = publishFailures.sort((a, b) => b.timestampMs - a.timestampMs).slice(0, listLimit);

  const httpSummary: BackendQualityHttpSummary = {
    total: httpById.size,
    success: httpSuccess,
    failed: httpFailed,
    missingEnd: httpMissingEnd,
    tookMsAvg: avg(httpTookValues),
    tookMsP95: percentile(httpTookValues, 95),
  };

  return {
    summary: {
      http: httpSummary,
      mqtt: mqttSummary,
    },
    http: {
      endpoints,
      failedRequests: failedRequestsTop,
      missingEndRequests: missingEndTop,
    },
    mqtt: {
      issuesByDevice: issuesByDeviceTop,
      ackTimeouts: ackTimeoutsTop,
      publishFailures: publishFailuresTop,
    },
  };
}
