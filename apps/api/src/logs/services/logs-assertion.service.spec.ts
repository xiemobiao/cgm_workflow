import { AssertionRuleType, AssertionRunStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { RbacService } from '../../rbac/rbac.service';
import { LogsHelperService } from './logs-helper.service';
import { LogsAssertionService } from './logs-assertion.service';

describe('LogsAssertionService', () => {
  it('installs default rules and skips existing ones', async () => {
    const prisma = {
      logAssertionRule: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ name: '[default] parser_error_must_be_zero' }]),
        create: jest.fn().mockResolvedValue({ id: 'r1' }),
      },
    } as unknown as PrismaService;

    const rbac = {
      requireProjectRoles: jest.fn().mockResolvedValue('Dev'),
    } as unknown as RbacService;

    const helper = {} as unknown as LogsHelperService;

    const service = new LogsAssertionService(prisma, rbac, helper);
    const result = await service.installDefaultRules({
      actorUserId: 'u1',
      projectId: 'p1',
    });

    expect(result.totalTemplates).toBeGreaterThan(0);
    expect(result.skippedCount).toBe(1);
    expect(result.createdCount + result.skippedCount).toBe(
      result.totalTemplates,
    );
    expect(
      (prisma.logAssertionRule.create as jest.Mock).mock.calls.length,
    ).toBe(result.createdCount);
  });

  it('runs validation and stores completed run summary', async () => {
    const prisma = {
      logAssertionRule: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'rule-1',
            name: 'must-have-sdk-init-success',
            ruleType: AssertionRuleType.event_must_exist,
            definition: {
              eventName: 'SDK init success',
              minCount: 1,
            } as Prisma.JsonValue,
          },
        ]),
      },
      logAssertionRun: {
        create: jest.fn().mockResolvedValue({ id: 'run-1' }),
        update: jest.fn().mockResolvedValue(undefined),
      },
      logEvent: {
        count: jest.fn().mockResolvedValue(2),
        findMany: jest.fn().mockResolvedValue([{ id: 'e1' }, { id: 'e2' }]),
      },
    } as unknown as PrismaService;

    const rbac = {
      requireProjectRoles: jest.fn().mockResolvedValue('Dev'),
    } as unknown as RbacService;

    const helper = {
      assertLogFileInProject: jest.fn().mockResolvedValue(undefined),
    } as unknown as LogsHelperService;

    const service = new LogsAssertionService(prisma, rbac, helper);
    const result = await service.runValidation({
      actorUserId: 'u1',
      projectId: 'p1',
      logFileId: 'lf1',
      triggeredBy: 'manual',
    });

    expect(result.pass).toBe(true);
    expect(result.totalRules).toBe(1);
    expect(result.failedRules).toBe(0);
    expect(
      (prisma.logAssertionRun.update as jest.Mock).mock.calls[0][0].data.status,
    ).toBe(AssertionRunStatus.completed);
  });

  it('auto mode installs defaults when no rules found', async () => {
    const prisma = {
      logAssertionRule: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([
            {
              id: 'rule-auto-1',
              name: 'auto-installed',
              ruleType: AssertionRuleType.event_must_not_exist,
              definition: {
                eventName: 'PARSER_ERROR',
                maxCount: 0,
              } as Prisma.JsonValue,
            },
          ]),
        create: jest.fn().mockResolvedValue({ id: 'rule-created' }),
      },
      logAssertionRun: {
        create: jest.fn().mockResolvedValue({ id: 'run-auto-1' }),
        update: jest.fn().mockResolvedValue(undefined),
      },
      logEvent: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as unknown as PrismaService;

    const rbac = {} as unknown as RbacService;

    const helper = {
      assertLogFileInProject: jest.fn().mockResolvedValue(undefined),
    } as unknown as LogsHelperService;

    const service = new LogsAssertionService(prisma, rbac, helper);
    const result = await service.runValidationInternal({
      projectId: 'p1',
      logFileId: 'lf1',
      triggeredBy: 'auto',
    });

    expect(
      (prisma.logAssertionRule.create as jest.Mock).mock.calls.length,
    ).toBeGreaterThan(0);
    expect(result.totalRules).toBe(1);
    expect(result.pass).toBe(true);
  });

  it('lists assertion runs and validates logFile access when needed', async () => {
    const prisma = {
      logAssertionRun: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'run-1',
            projectId: 'p1',
            logFileId: 'lf1',
            status: AssertionRunStatus.completed,
            triggeredBy: 'manual',
            totalRules: 2,
            passedRules: 2,
            failedRules: 0,
            passRate: 100,
            errorMessage: null,
            startedAt: new Date('2026-02-11T10:00:00.000Z'),
            completedAt: new Date('2026-02-11T10:01:00.000Z'),
            createdAt: new Date('2026-02-11T10:00:00.000Z'),
            logFile: {
              fileName: 'a.jsonl',
              uploadedAt: new Date('2026-02-11T09:00:00.000Z'),
            },
          },
        ]),
      },
    } as unknown as PrismaService;

    const rbac = {
      requireProjectRoles: jest.fn().mockResolvedValue('Dev'),
    } as unknown as RbacService;

    const helper = {
      assertLogFileInProject: jest.fn().mockResolvedValue(undefined),
    } as unknown as LogsHelperService;

    const service = new LogsAssertionService(prisma, rbac, helper);
    const result = await service.listRuns({
      actorUserId: 'u1',
      projectId: 'p1',
      logFileId: 'lf1',
      limit: 10,
    });

    expect(result.items.length).toBe(1);
    expect((helper.assertLogFileInProject as jest.Mock).mock.calls.length).toBe(
      1,
    );
  });
});
