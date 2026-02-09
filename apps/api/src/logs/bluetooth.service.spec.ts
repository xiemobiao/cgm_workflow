import { BluetoothAnomalyService } from './bluetooth-anomaly.service';
import { BluetoothCommandService } from './bluetooth-command.service';
import { BluetoothSessionService } from './bluetooth-session.service';
import { BluetoothService } from './bluetooth.service';

describe('BluetoothService facade', () => {
  it('delegates calls to split services', async () => {
    const aggregateSpy = jest.fn().mockResolvedValue({ count: 1 });
    const analyzeSpy = jest.fn().mockResolvedValue({ chains: [] });
    const enhancedInternalSpy = jest.fn().mockResolvedValue({ anomalies: [] });

    const sessionService = {
      aggregateSessions: aggregateSpy,
    } as unknown as BluetoothSessionService;
    const commandService = {
      analyzeCommandChains: analyzeSpy,
    } as unknown as BluetoothCommandService;
    const anomalyService = {
      detectAnomaliesEnhancedInternal: enhancedInternalSpy,
    } as unknown as BluetoothAnomalyService;

    const service = new BluetoothService(
      sessionService,
      commandService,
      anomalyService,
    );

    const aggregateInput = {
      actorUserId: 'u1',
      projectId: 'p1',
      startTime: '2026-01-01T00:00:00.000Z',
      endTime: '2026-01-01T01:00:00.000Z',
    };
    const commandInput = {
      actorUserId: 'u1',
      projectId: 'p1',
      startTime: '2026-01-01T00:00:00.000Z',
      endTime: '2026-01-01T01:00:00.000Z',
    };
    const internalInput = {
      projectId: 'p1',
      startTime: '2026-01-01T00:00:00.000Z',
      endTime: '2026-01-01T01:00:00.000Z',
    };

    await service.aggregateSessions(aggregateInput);
    await service.analyzeCommandChains(commandInput);
    await service.detectAnomaliesEnhancedInternal(internalInput);

    expect(aggregateSpy).toHaveBeenCalledWith(aggregateInput);
    expect(analyzeSpy).toHaveBeenCalledWith(commandInput);
    expect(enhancedInternalSpy).toHaveBeenCalledWith(internalInput);
  });
});
