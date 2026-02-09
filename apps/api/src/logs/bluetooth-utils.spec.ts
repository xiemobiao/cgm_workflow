import {
  extractMsgPreview,
  isBleConnectStartEvent,
  isBleConnectSuccessEvent,
  isBleDisconnectEvent,
  isBleOp,
  matchesPattern,
  normalizeLower,
} from './bluetooth-utils';

describe('bluetooth-utils', () => {
  it('matches pattern case-insensitively', () => {
    expect(matchesPattern('ble connect_start', ['CONNECT_START'])).toBe(true);
    expect(matchesPattern('mqtt publish', ['CONNECT_START'])).toBe(false);
  });

  it('normalizes text and evaluates structured ble ops', () => {
    expect(normalizeLower('  CONNECT  ')).toBe('connect');
    expect(normalizeLower(undefined)).toBeNull();

    expect(
      isBleOp({ stage: 'BLE', op: 'CONNECT', result: 'OK' }, 'connect', 'ok'),
    ).toBe(true);
    expect(
      isBleOp(
        { stage: 'ble', op: 'connect', result: 'timeout' },
        'connect',
        'ok',
      ),
    ).toBe(false);
  });

  it('identifies connect/disconnect events from structured and fallback fields', () => {
    expect(
      isBleDisconnectEvent({
        eventName: 'ignored',
        stage: 'ble',
        op: 'disconnect',
      }),
    ).toBe(true);
    expect(
      isBleDisconnectEvent({
        eventName: 'device disconnected by peer',
      }),
    ).toBe(true);

    expect(
      isBleConnectStartEvent({
        eventName: 'ignored',
        stage: 'ble',
        op: 'connect',
        result: 'start',
      }),
    ).toBe(true);
    expect(
      isBleConnectSuccessEvent({
        eventName: 'connection_success',
      }),
    ).toBe(true);
  });

  it('builds message preview safely', () => {
    expect(extractMsgPreview('abc')).toBe('abc');
    expect(extractMsgPreview({ a: 1 })).toContain('"a":1');
    expect(extractMsgPreview(null)).toBeNull();
  });
});
