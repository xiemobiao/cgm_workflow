import { PrismaService } from '../database/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import { BluetoothCommandService } from './bluetooth-command.service';

describe('BluetoothCommandService', () => {
  it('analyzes command chains and computes status stats', async () => {
    const prisma = {
      logEvent: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: '1',
            eventName: 'COMMAND_START',
            level: 2,
            timestampMs: 1000n,
            requestId: 'req-success',
            errorCode: null,
          },
          {
            id: '2',
            eventName: 'COMMAND_RESPONSE',
            level: 2,
            timestampMs: 1600n,
            requestId: 'req-success',
            errorCode: null,
          },
          {
            id: '3',
            eventName: 'COMMAND_START',
            level: 2,
            timestampMs: 2000n,
            requestId: 'req-timeout',
            errorCode: null,
          },
          {
            id: '4',
            eventName: 'COMMAND_TIMEOUT',
            level: 4,
            timestampMs: 2800n,
            requestId: 'req-timeout',
            errorCode: null,
          },
        ]),
      },
    } as unknown as PrismaService;
    const rbac = {
      requireProjectRoles: jest.fn().mockResolvedValue(undefined),
    } as unknown as RbacService;

    const service = new BluetoothCommandService(prisma, rbac);
    const result = await service.analyzeCommandChains({
      actorUserId: 'u1',
      projectId: 'p1',
      startTime: '2026-01-01T00:00:00.000Z',
      endTime: '2026-01-01T01:00:00.000Z',
    });

    expect(result.stats.total).toBe(2);
    expect(result.stats.success).toBe(1);
    expect(result.stats.timeout).toBe(1);
    expect(result.stats.avgDurationMs).toBe(700);
    expect(result.chains[0].requestId).toBe('req-success');
    expect(result.chains[1].requestId).toBe('req-timeout');
  });
});
