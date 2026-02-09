import { Prisma } from '@prisma/client';

export const BLE_PHASE_PATTERNS = {
  scan: ['SCAN_START', 'SCAN_DEVICE', 'DEVICE_FOUND', 'BLE scan'],
  pair: ['PAIR_START', 'PAIRING', 'BOND', 'BLE pair'],
  connect: ['CONNECT_START', 'CONNECTING', 'GATT_CONNECT', 'BLE connect'],
  connected: [
    'CONNECTED',
    'CONNECTION_SUCCESS',
    'GATT_CONNECTED',
    'BLE connected',
  ],
  disconnect: [
    'DISCONNECT',
    'DISCONNECTED',
    'CONNECTION_LOST',
    'BLE disconnect',
  ],
  error: ['ERROR', 'FAILED', 'TIMEOUT', 'Exception'],
} as const;

type BleResult = 'start' | 'ok' | 'fail' | 'timeout';

export function matchesPattern(eventName: string, patterns: readonly string[]) {
  const upper = eventName.toUpperCase();
  return patterns.some((pattern) => upper.includes(pattern.toUpperCase()));
}

export function normalizeLower(value: string | null | undefined) {
  const text = value?.trim() ?? '';
  return text.length > 0 ? text.toLowerCase() : null;
}

export function isBleOp(
  row: { stage?: string | null; op?: string | null; result?: string | null },
  op: string,
  result?: BleResult,
) {
  const stage = normalizeLower(row.stage);
  const rowOp = normalizeLower(row.op);
  const rowResult = normalizeLower(row.result);
  if (stage !== 'ble' || rowOp !== op) return false;
  if (result === undefined) return true;
  return rowResult === result;
}

export function isBleDisconnectEvent(row: {
  eventName: string;
  stage?: string | null;
  op?: string | null;
}) {
  if (row.stage || row.op) {
    return isBleOp(row, 'disconnect');
  }
  return matchesPattern(row.eventName, BLE_PHASE_PATTERNS.disconnect);
}

export function isBleConnectStartEvent(row: {
  eventName: string;
  stage?: string | null;
  op?: string | null;
  result?: string | null;
}) {
  if (row.stage || row.op || row.result) {
    return isBleOp(row, 'connect', 'start');
  }
  return matchesPattern(row.eventName, BLE_PHASE_PATTERNS.connect);
}

export function isBleConnectSuccessEvent(row: {
  eventName: string;
  stage?: string | null;
  op?: string | null;
  result?: string | null;
}) {
  if (row.stage || row.op || row.result) {
    return isBleOp(row, 'connect', 'ok');
  }
  return matchesPattern(row.eventName, BLE_PHASE_PATTERNS.connected);
}

export function extractMsgPreview(
  msgJson: Prisma.JsonValue,
  maxLength = 200,
): string | null {
  if (!msgJson) return null;
  if (typeof msgJson === 'string') return msgJson.slice(0, maxLength);
  if (typeof msgJson === 'object') {
    try {
      const text = JSON.stringify(msgJson);
      return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
    } catch {
      return null;
    }
  }
  return String(msgJson).slice(0, maxLength);
}
