import { PrismaService } from '../database/prisma.service';
import { EventFlowAnalyzerService } from './event-flow-analyzer.service';

describe('EventFlowAnalyzerService', () => {
  it('uses per-attempt duration for BLE connection stage instead of first-last span', async () => {
    const prisma = {
      logEvent: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([{ linkCode: 'LC-1' }])
          .mockResolvedValueOnce([
            {
              id: 'e1',
              linkCode: 'LC-1',
              eventName: 'APP starts to launch',
              timestampMs: 1_000n,
              deviceMac: null,
              attemptId: null,
            },
            {
              id: 'e2',
              linkCode: 'LC-1',
              eventName: 'APP startup completed',
              timestampMs: 2_000n,
              deviceMac: null,
              attemptId: null,
            },
            {
              id: 'e3',
              linkCode: 'LC-1',
              eventName: 'SDK init start',
              timestampMs: 2_100n,
              deviceMac: null,
              attemptId: null,
            },
            {
              id: 'e4',
              linkCode: 'LC-1',
              eventName: 'SDK init success',
              timestampMs: 2_400n,
              deviceMac: null,
              attemptId: null,
            },
            {
              id: 'e5',
              linkCode: 'LC-1',
              eventName: 'BLE start searching',
              timestampMs: 3_000n,
              deviceMac: null,
              attemptId: null,
            },
            {
              id: 'e6',
              linkCode: 'LC-1',
              eventName: 'BLE search success',
              timestampMs: 5_000n,
              deviceMac: null,
              attemptId: null,
            },
            {
              id: 'e7',
              linkCode: 'LC-1',
              eventName: 'BLE start connection',
              timestampMs: 6_000n,
              deviceMac: null,
              attemptId: 'a1',
            },
            {
              id: 'e8',
              linkCode: 'LC-1',
              eventName: 'BLE connection success',
              timestampMs: 10_878n,
              deviceMac: null,
              attemptId: 'a1',
            },
            {
              id: 'e9',
              linkCode: 'LC-1',
              eventName: 'BLE start connection',
              timestampMs: 20_000n,
              deviceMac: null,
              attemptId: 'a2',
            },
            {
              id: 'e10',
              linkCode: 'LC-1',
              eventName: 'BLE connection success',
              timestampMs: 21_960n,
              deviceMac: null,
              attemptId: 'a2',
            },
            {
              id: 'e11',
              linkCode: 'LC-1',
              eventName: 'BLE start connection',
              timestampMs: 30_000n,
              deviceMac: null,
              attemptId: 'a3',
            },
            {
              id: 'e12',
              linkCode: 'LC-1',
              eventName: 'BLE connection success',
              timestampMs: 34_109n,
              deviceMac: null,
              attemptId: 'a3',
            },
            {
              id: 'e13',
              linkCode: 'LC-1',
              eventName: 'BLE start connection',
              timestampMs: 70_000n,
              deviceMac: null,
              attemptId: 'a4',
            },
            {
              id: 'e14',
              linkCode: 'LC-1',
              eventName: 'BLE connection success',
              timestampMs: 72_800n,
              deviceMac: null,
              attemptId: 'a4',
            },
            {
              id: 'e15',
              linkCode: 'LC-1',
              eventName: 'BLE start connection',
              timestampMs: 150_000n,
              deviceMac: null,
              attemptId: 'a5',
            },
            {
              id: 'e16',
              linkCode: 'LC-1',
              eventName: 'BLE connection success',
              timestampMs: 154_307n,
              deviceMac: null,
              attemptId: 'a5',
            },
            {
              id: 'e17',
              linkCode: 'LC-1',
              eventName: 'BLE auth success',
              timestampMs: 155_000n,
              deviceMac: null,
              attemptId: null,
            },
            {
              id: 'e18',
              linkCode: 'LC-1',
              eventName: 'BLE real time data callback start',
              timestampMs: 156_000n,
              deviceMac: null,
              attemptId: null,
            },
            {
              id: 'e19',
              linkCode: 'LC-1',
              eventName: 'BLE real time data callback done',
              timestampMs: 157_000n,
              deviceMac: null,
              attemptId: null,
            },
          ]),
      },
    } as unknown as PrismaService;

    const service = new EventFlowAnalyzerService(prisma);
    const result = await service.analyzeMainFlow('lf-1');

    const bleConnect = result.stages.find((s) => s.stageId === 'ble_connect');
    expect(bleConnect).toBeDefined();

    // Stage stats should come from all attempts in the session:
    // [4878, 1960, 4109, 2800, 4307]
    expect(bleConnect?.minDurationMs).toBe(1_960);
    expect(bleConnect?.maxObservedDurationMs).toBe(4_878);
    expect(bleConnect?.avgDurationMs).toBeCloseTo(3_610.8, 1);
    expect(bleConnect?.issues.some((issue) => issue.type === 'timeout')).toBe(
      false,
    );
  });
});
