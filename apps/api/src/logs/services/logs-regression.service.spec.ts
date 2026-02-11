import { AnalysisStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { RbacService } from '../../rbac/rbac.service';
import { LogsHelperService } from './logs-helper.service';
import { LogsRegressionService } from './logs-regression.service';

describe('LogsRegressionService', () => {
  it('flags regressions when target quality drops beyond threshold', async () => {
    const prisma = {
      logFileAnalysis: {
        findUnique: jest.fn().mockResolvedValue({
          qualityScore: 80,
          totalEvents: 100,
          errorEvents: 15,
          warningEvents: 10,
          sessionCount: 4,
          deviceCount: 1,
          status: AnalysisStatus.completed,
        }),
      },
      logRegressionBaseline: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'baseline-1',
          logFileId: 'log-base',
          name: 'baseline',
          snapshot: {
            qualityScore: 90,
            totalEvents: 100,
            errorEvents: 5,
            warningEvents: 5,
            sessionCount: 5,
            deviceCount: 1,
            errorRate: 5,
          } as Prisma.JsonValue,
          thresholds: Prisma.JsonNull,
        }),
      },
    } as unknown as PrismaService;

    const rbac = {
      requireProjectRoles: jest.fn().mockResolvedValue('Dev'),
    } as unknown as RbacService;

    const helper = {
      assertLogFileInProject: jest.fn().mockResolvedValue(undefined),
    } as unknown as LogsHelperService;

    const service = new LogsRegressionService(prisma, rbac, helper);

    const result = await service.compareWithBaseline({
      actorUserId: 'u1',
      projectId: 'p1',
      targetLogFileId: 'log-target',
      baselineId: 'baseline-1',
    });

    expect(result.pass).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.violations.some((v) => v.metric === 'qualityScore')).toBe(
      true,
    );
    expect((helper.assertLogFileInProject as jest.Mock).mock.calls.length).toBe(
      1,
    );
  });

  it('returns regression trend against selected baseline', async () => {
    const prisma = {
      logFileAnalysis: {
        findMany: jest.fn().mockResolvedValue([
          {
            logFileId: 'lf-1',
            qualityScore: 92,
            totalEvents: 100,
            errorEvents: 4,
            warningEvents: 6,
            sessionCount: 5,
            deviceCount: 1,
            analyzedAt: new Date('2026-02-11T10:00:00.000Z'),
            createdAt: new Date('2026-02-11T10:01:00.000Z'),
            logFile: {
              fileName: 'good.jsonl',
              uploadedAt: new Date('2026-02-11T09:00:00.000Z'),
            },
          },
          {
            logFileId: 'lf-2',
            qualityScore: 75,
            totalEvents: 120,
            errorEvents: 20,
            warningEvents: 15,
            sessionCount: 3,
            deviceCount: 1,
            analyzedAt: new Date('2026-02-11T11:00:00.000Z'),
            createdAt: new Date('2026-02-11T11:01:00.000Z'),
            logFile: {
              fileName: 'bad.jsonl',
              uploadedAt: new Date('2026-02-11T10:30:00.000Z'),
            },
          },
        ]),
      },
      logRegressionBaseline: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'baseline-1',
          logFileId: 'log-base',
          name: 'baseline',
          snapshot: {
            qualityScore: 90,
            totalEvents: 100,
            errorEvents: 5,
            warningEvents: 5,
            sessionCount: 5,
            deviceCount: 1,
            errorRate: 5,
          } as Prisma.JsonValue,
          thresholds: {
            qualityScoreDropMax: 5,
            errorRateIncreaseMax: 1,
            errorEventsIncreaseMax: 5,
          } as Prisma.JsonValue,
        }),
      },
    } as unknown as PrismaService;

    const rbac = {
      requireProjectRoles: jest.fn().mockResolvedValue('Dev'),
    } as unknown as RbacService;

    const helper = {
      assertLogFileInProject: jest.fn().mockResolvedValue(undefined),
    } as unknown as LogsHelperService;

    const service = new LogsRegressionService(prisma, rbac, helper);

    const result = await service.getRegressionTrend({
      actorUserId: 'u1',
      projectId: 'p1',
      baselineId: 'baseline-1',
      limit: 10,
    });

    expect(result.items.length).toBe(2);
    expect(result.items[0].fileName).toBe('good.jsonl');
    expect(result.items[1].fileName).toBe('bad.jsonl');
    expect(result.items.some((item) => item.pass)).toBe(true);
    expect(result.items.some((item) => !item.pass)).toBe(true);
    expect(result.items[1].topViolations.length).toBeLessThanOrEqual(3);
  });
});
