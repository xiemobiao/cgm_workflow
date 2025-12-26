import { buildBleQualityReport } from './ble-quality';
import { BLE_REQUIRED_EVENTS } from './ble-required-events';

describe('buildBleQualityReport', () => {
  it('computes ok/missing/mismatch statuses and pair pending counts', () => {
    const report = buildBleQualityReport({
      stats: [
        { eventName: 'SDK init start', level: 2, count: 1 },
        { eventName: 'BLE start searching', level: 2, count: 3 },
        { eventName: 'BLE sdk info', level: 2, count: 1 }, // expected DEBUG(1)
        { eventName: 'BLE current status value', level: 1, count: 2 }, // name mismatch
      ],
      parserErrorCount: 0,
      logan: null,
    });

    expect(report.summary.requiredTotal).toBe(BLE_REQUIRED_EVENTS.length);
    expect(report.summary.okTotal).toBe(2);
    expect(report.summary.levelMismatchTotal).toBe(1);
    expect(report.summary.nameMismatchTotal).toBe(1);
    expect(report.summary.missingTotal).toBe(BLE_REQUIRED_EVENTS.length - 4);

    const sdkInitStart = report.requiredEvents.find(
      (e) => e.eventName === 'SDK init start',
    );
    expect(sdkInitStart?.status).toBe('ok');
    expect(sdkInitStart?.expectedLevelLabel).toBe('INFO');

    const sdkInfo = report.requiredEvents.find((e) => e.eventName === 'BLE sdk info');
    expect(sdkInfo?.status).toBe('level_mismatch');
    expect(sdkInfo?.expectedLevelLabel).toBe('DEBUG');
    expect(sdkInfo?.totalCount).toBe(1);
    expect(sdkInfo?.expectedLevelCount).toBe(0);
    expect(sdkInfo?.countsByLevel).toEqual({ '1': 0, '2': 1, '3': 0, '4': 0 });

    const statusValue = report.requiredEvents.find(
      (e) => e.eventName === 'BLE current Status Value',
    );
    expect(statusValue?.status).toBe('name_mismatch');
    expect(statusValue?.matchedEventNames).toContain('BLE current status value');

    const scanPair = report.pairChecks.find(
      (p) => p.startEventName === 'BLE start searching',
    );
    expect(scanPair?.pendingCount).toBe(3);
  });
});

