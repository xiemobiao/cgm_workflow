import { PrismaService } from '../database/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import { BluetoothAnomalyService } from './bluetooth-anomaly.service';

describe('BluetoothAnomalyService', () => {
  it('detects frequent disconnect anomalies', async () => {
    const prisma = {
      logEvent: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'e1',
            eventName: 'DISCONNECT',
            level: 3,
            timestampMs: 1000n,
            linkCode: 'LC-1',
            attemptId: null,
            deviceMac: 'AA:BB',
            errorCode: null,
            sdkVersion: '1.0.0',
            stage: null,
            op: null,
            result: null,
          },
          {
            id: 'e2',
            eventName: 'DISCONNECTED',
            level: 3,
            timestampMs: 2000n,
            linkCode: 'LC-1',
            attemptId: null,
            deviceMac: 'AA:BB',
            errorCode: null,
            sdkVersion: '1.0.0',
            stage: null,
            op: null,
            result: null,
          },
          {
            id: 'e3',
            eventName: 'CONNECTION_LOST',
            level: 4,
            timestampMs: 3000n,
            linkCode: 'LC-2',
            attemptId: null,
            deviceMac: 'AA:BB',
            errorCode: 'E-CONN',
            sdkVersion: '1.0.0',
            stage: null,
            op: null,
            result: null,
          },
        ]),
      },
    } as unknown as PrismaService;
    const rbac = {
      requireProjectRoles: jest.fn().mockResolvedValue(undefined),
    } as unknown as RbacService;

    const service = new BluetoothAnomalyService(prisma, rbac);
    const result = await service.detectAnomalies({
      actorUserId: 'u1',
      projectId: 'p1',
      startTime: '2026-01-01T00:00:00.000Z',
      endTime: '2026-01-01T01:00:00.000Z',
    });

    expect(
      result.patterns.some(
        (pattern) => pattern.patternType === 'frequent_disconnect',
      ),
    ).toBe(true);
    expect(result.summary.disconnectEvents).toBe(3);
  });
});
