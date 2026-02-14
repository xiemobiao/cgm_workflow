import type { CurrentUserPayload } from '../auth/current-user.decorator';
import { EVENT_FLOW_TEMPLATE_VERSION } from './event-flow-templates';
import { LogsController } from './logs.controller';

describe('LogsController event flow analysis refresh', () => {
  const user: CurrentUserPayload = {
    userId: '11111111-1111-4111-8111-111111111111',
    email: 'qa@example.com',
  };
  const logFileId = '22222222-2222-4222-8222-222222222222';

  function buildController(overrides?: {
    getLogFileAnalysis?: jest.Mock;
    refreshEventFlowAnalysis?: jest.Mock;
  }) {
    const logsFile = {
      getLogFileAnalysis:
        overrides?.getLogFileAnalysis ??
        jest.fn().mockResolvedValue({
          mainFlowAnalysis: {
            templateVersion: EVENT_FLOW_TEMPLATE_VERSION,
          },
          eventCoverageAnalysis: {
            templateVersion: EVENT_FLOW_TEMPLATE_VERSION,
          },
        }),
      listLogFiles: jest.fn(),
    } as any;

    const analyzer = {
      refreshEventFlowAnalysis:
        overrides?.refreshEventFlowAnalysis ??
        jest.fn().mockResolvedValue({
          mainFlowAnalysis: { templateVersion: EVENT_FLOW_TEMPLATE_VERSION },
          eventCoverageAnalysis: {
            templateVersion: EVENT_FLOW_TEMPLATE_VERSION,
          },
        }),
      analyzeLogFile: jest.fn(),
      refreshEventFlowAnalysisByProject: jest.fn(),
    } as any;

    const controller = new LogsController(
      {} as any,
      logsFile,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      analyzer,
    );

    return { controller, logsFile, analyzer };
  }

  it('refreshes stale event-flow snapshots when template version is outdated', async () => {
    const staleVersion = EVENT_FLOW_TEMPLATE_VERSION - 1;
    const { controller, analyzer } = buildController({
      getLogFileAnalysis: jest.fn().mockResolvedValue({
        mainFlowAnalysis: { templateVersion: staleVersion },
        eventCoverageAnalysis: { templateVersion: staleVersion },
      }),
    });

    const result = await controller.getEventFlowAnalysis(user, logFileId);

    expect(analyzer.refreshEventFlowAnalysis).toHaveBeenCalledWith(logFileId);
    expect(result).toEqual({
      mainFlowAnalysis: { templateVersion: EVENT_FLOW_TEMPLATE_VERSION },
      eventCoverageAnalysis: { templateVersion: EVENT_FLOW_TEMPLATE_VERSION },
    });
  });

  it('returns cached event-flow snapshots when template version is current', async () => {
    const currentSnapshot = {
      mainFlowAnalysis: { templateVersion: EVENT_FLOW_TEMPLATE_VERSION },
      eventCoverageAnalysis: { templateVersion: EVENT_FLOW_TEMPLATE_VERSION },
    };
    const { controller, analyzer } = buildController({
      getLogFileAnalysis: jest.fn().mockResolvedValue(currentSnapshot),
    });

    const result = await controller.getEventFlowAnalysis(user, logFileId);

    expect(analyzer.refreshEventFlowAnalysis).not.toHaveBeenCalled();
    expect(result).toEqual(currentSnapshot);
  });
});
