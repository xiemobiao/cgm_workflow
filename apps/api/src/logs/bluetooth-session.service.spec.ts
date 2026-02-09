import { SessionStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import { BluetoothCommandService } from './bluetooth-command.service';
import { BluetoothSessionService } from './bluetooth-session.service';

describe('BluetoothSessionService', () => {
  it('reuses existing aggregated session when forceRefresh=false', async () => {
    const prisma = {
      logEvent: {
        findMany: jest.fn().mockResolvedValue([{ linkCode: 'LC-1' }]),
      },
      deviceSession: {
        findUnique: jest.fn().mockResolvedValue({ id: 's1', linkCode: 'LC-1' }),
      },
    } as unknown as PrismaService;
    const rbac = {
      requireProjectRoles: jest.fn().mockResolvedValue(undefined),
    } as unknown as RbacService;
    const command = {} as unknown as BluetoothCommandService;

    const service = new BluetoothSessionService(prisma, rbac, command);
    const result = await service.aggregateSessions({
      actorUserId: 'u1',
      projectId: 'p1',
      startTime: '2026-01-01T00:00:00.000Z',
      endTime: '2026-01-01T01:00:00.000Z',
      forceRefresh: false,
    });

    expect(result.count).toBe(1);
    expect(result.sessions[0]).toEqual({ id: 's1', linkCode: 'LC-1' });
    expect(
      (prisma.deviceSession.findUnique as jest.Mock).mock.calls.length,
    ).toBe(1);
  });

  it('returns null for logFile session detail when no events', async () => {
    const prisma = {
      logFile: {
        findFirst: jest.fn().mockResolvedValue({ id: 'lf1' }),
      },
      logEvent: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as unknown as PrismaService;
    const rbac = {
      requireProjectRoles: jest.fn().mockResolvedValue(undefined),
    } as unknown as RbacService;
    const command = {
      buildCommandChains: jest.fn().mockReturnValue([]),
    } as unknown as BluetoothCommandService;

    const service = new BluetoothSessionService(prisma, rbac, command);
    const result = await service.getSessionDetail({
      actorUserId: 'u1',
      projectId: 'p1',
      logFileId: 'lf1',
      linkCode: 'LC-1',
    });

    expect(result).toBeNull();
  });

  it('filters sessions by status when reading from log file', async () => {
    const prisma = {
      logFile: {
        findFirst: jest.fn().mockResolvedValue({ id: 'lf1' }),
      },
      logEvent: {
        groupBy: jest.fn().mockResolvedValue([
          {
            linkCode: 'LC-1',
            _min: { timestampMs: 1n },
            _max: { timestampMs: 3n },
          },
        ]),
        findMany: jest.fn().mockResolvedValue([
          {
            linkCode: 'LC-1',
            id: 'e1',
            eventName: 'SCAN_START',
            level: 2,
            timestampMs: 1n,
            sdkVersion: null,
            appId: null,
            terminalInfo: null,
            deviceMac: 'AA:BB',
            errorCode: null,
            requestId: null,
          },
          {
            linkCode: 'LC-1',
            id: 'e2',
            eventName: 'CONNECTED',
            level: 2,
            timestampMs: 3n,
            sdkVersion: null,
            appId: null,
            terminalInfo: null,
            deviceMac: 'AA:BB',
            errorCode: null,
            requestId: 'r1',
          },
        ]),
      },
    } as unknown as PrismaService;
    const rbac = {
      requireProjectRoles: jest.fn().mockResolvedValue(undefined),
    } as unknown as RbacService;
    const command = {} as unknown as BluetoothCommandService;

    const service = new BluetoothSessionService(prisma, rbac, command);
    const result = await service.getSessions({
      actorUserId: 'u1',
      projectId: 'p1',
      logFileId: 'lf1',
      status: SessionStatus.communicating,
    });

    expect(result.hasMore).toBe(false);
    expect(result.items.length).toBe(1);
    expect(result.items[0].status).toBe(SessionStatus.communicating);
  });
});
