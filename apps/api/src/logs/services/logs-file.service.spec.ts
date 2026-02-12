import { PrismaService } from '../../database/prisma.service';
import { RbacService } from '../../rbac/rbac.service';
import { AuditService } from '../../audit/audit.service';
import { StorageService } from '../../storage/storage.service';
import { LogProcessingService } from '../log-processing.service';
import { LogsHelperService } from './logs-helper.service';
import { LogsFileService } from './logs-file.service';

type ReasonCodeGroupRow = {
  reasonCode: string | null;
  _count: { _all: number | string };
};

type StageOpResultGroupRow = {
  stage: string | null;
  op: string | null;
  result: string | null;
  reasonCode: string | null;
  _count: { _all: number | string };
};

describe('LogsFileService reason code summary', () => {
  function createService(params: {
    totalEvents: number;
    reasonCodeGroups: ReasonCodeGroupRow[];
    stageOpResultGroups?: StageOpResultGroupRow[];
  }) {
    const groupBy = jest
      .fn()
      .mockResolvedValueOnce(params.reasonCodeGroups)
      .mockResolvedValueOnce(params.stageOpResultGroups ?? []);

    const prisma = {
      logFile: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'lf1',
          projectId: 'p1',
        }),
      },
      logEvent: {
        count: jest.fn().mockResolvedValue(params.totalEvents),
        groupBy,
      },
    } as unknown as PrismaService;

    const rbac = {
      requireProjectRoles: jest.fn().mockResolvedValue('Dev'),
    } as unknown as RbacService;

    const audit = {} as AuditService;
    const storage = {} as StorageService;
    const helper = {} as LogsHelperService;
    const processing = {} as LogProcessingService;

    const service = new LogsFileService(
      prisma,
      rbac,
      audit,
      storage,
      helper,
      processing,
    );

    return { service, prisma, rbac, groupBy };
  }

  it('returns empty summary when no reasonCode events', async () => {
    const { service, groupBy, rbac } = createService({
      totalEvents: 5,
      reasonCodeGroups: [],
    });

    const result = await service.getReasonCodeSummary({
      actorUserId: 'u1',
      id: 'lf1',
    });

    expect(result.totalEvents).toBe(5);
    expect(result.reasonCodeEvents).toBe(0);
    expect(result.missingReasonCodeEvents).toBe(5);
    expect(result.coverageRatio).toBe(0);
    expect(result.topReasonCodes).toEqual([]);
    expect(result.byCategory).toEqual([]);
    expect(result.topStageOpResults).toEqual([]);
    expect(groupBy).toHaveBeenCalledTimes(1);
    expect((rbac.requireProjectRoles as jest.Mock).mock.calls.length).toBe(1);
  });

  it('aggregates reasonCode/category/stage-op-result correctly', async () => {
    const { service } = createService({
      totalEvents: 10,
      reasonCodeGroups: [
        { reasonCode: 'LINK_LOSS', _count: { _all: 3 } },
        { reasonCode: 'LINK_LOSS', _count: { _all: 1 } },
        { reasonCode: 'HTTP_TIMEOUT', _count: { _all: 2 } },
        { reasonCode: '', _count: { _all: 99 } },
        { reasonCode: null, _count: { _all: 99 } },
      ],
      stageOpResultGroups: [
        {
          stage: 'ble',
          op: 'connect',
          result: 'fail',
          reasonCode: 'LINK_LOSS',
          _count: { _all: 4 },
        },
        {
          stage: 'ble',
          op: 'connect',
          result: 'fail',
          reasonCode: 'HTTP_TIMEOUT',
          _count: { _all: 1 },
        },
        {
          stage: 'http',
          op: 'upload',
          result: 'timeout',
          reasonCode: 'HTTP_TIMEOUT',
          _count: { _all: '2' },
        },
      ],
    });

    const result = await service.getReasonCodeSummary({
      actorUserId: 'u1',
      id: 'lf1',
    });

    expect(result.reasonCodeEvents).toBe(6);
    expect(result.missingReasonCodeEvents).toBe(4);
    expect(result.coverageRatio).toBe(60);
    expect(result.uniqueReasonCodeCount).toBe(2);

    expect(result.topReasonCodes[0]?.reasonCode).toBe('LINK_LOSS');
    expect(result.topReasonCodes[0]?.count).toBe(4);
    expect(result.topReasonCodes[0]?.category).toBe('session');
    expect(result.topReasonCodes[1]?.reasonCode).toBe('HTTP_TIMEOUT');
    expect(result.topReasonCodes[1]?.category).toBe('timeout');

    const categoryLabels = result.byCategory.map((item) => item.category);
    expect(categoryLabels).toEqual(['session', 'timeout']);

    expect(result.topStageOpResults.length).toBeGreaterThan(0);
    expect(result.topStageOpResults[0]?.stage).toBe('ble');
    expect(result.topStageOpResults[0]?.op).toBe('connect');
    expect(result.topStageOpResults[0]?.result).toBe('fail');
    expect(result.topStageOpResults[0]?.count).toBe(5);
    expect(result.topStageOpResults[0]?.topReasonCodes[0]?.reasonCode).toBe(
      'LINK_LOSS',
    );
  });
});
