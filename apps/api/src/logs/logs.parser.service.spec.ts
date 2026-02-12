import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';
import { StorageService } from '../storage/storage.service';
import {
  extractTrackingFields,
  LogsParserService,
} from './logs.parser.service';
import { LoganDecryptService } from './logan-decrypt.service';
import { LogsAnalyzerService } from './logs-analyzer.service';
import { LogsAssertionService } from './services/logs-assertion.service';

describe('extractTrackingFields', () => {
  const empty = {
    linkCode: null,
    requestId: null,
    attemptId: null,
    deviceMac: null,
    deviceSn: null,
    errorCode: null,
    reasonCode: null,
    stage: null,
    op: null,
    result: null,
  };

  it('returns nulls for unsupported msg', () => {
    expect(extractTrackingFields(null)).toEqual(empty);
    expect(extractTrackingFields('x')).toEqual(empty);
    expect(extractTrackingFields(123)).toEqual(empty);
  });

  it('does not extract from plain text', () => {
    expect(
      extractTrackingFields(
        'linkCode=LC-STR requestId=REQ-STR deviceMac=AA:BB:CC:DD:EE:FF deviceSn=SN-STR errorCode=E1',
      ),
    ).toEqual(empty);
  });

  it('parses JSON string msg', () => {
    expect(
      extractTrackingFields(
        '{"stage":"MQTT","op":"PUBLISH","result":"OK","deviceSn":"SN-J","linkCode":"LC-J","attemptId":"AT-1"}',
      ),
    ).toEqual({
      ...empty,
      linkCode: 'LC-J',
      deviceSn: 'SN-J',
      attemptId: 'AT-1',
      stage: 'mqtt',
      op: 'publish',
      result: 'ok',
    });
  });

  it('extracts canonical fields from top-level keys', () => {
    expect(
      extractTrackingFields({
        stage: 'ble',
        op: 'connect',
        result: 'start',
        linkCode: 'LC-1',
        requestId: 'REQ-1',
        attemptId: 'AT-2',
        deviceMac: 'AA:BB:CC:DD:EE:FF',
        deviceSn: 'SN-1',
        errorCode: 'E8',
        reasonCode: 'LINK_LOSS',
      }),
    ).toEqual({
      ...empty,
      linkCode: 'LC-1',
      requestId: 'REQ-1',
      attemptId: 'AT-2',
      deviceMac: 'AA:BB:CC:DD:EE:FF',
      deviceSn: 'SN-1',
      errorCode: 'E8',
      reasonCode: 'LINK_LOSS',
      stage: 'ble',
      op: 'connect',
      result: 'start',
    });
  });

  it('extracts fields from nested msg.data', () => {
    expect(
      extractTrackingFields({
        data: {
          stage: 'http',
          op: 'request',
          result: 'fail',
          linkCode: 'LC-2',
          msgId: 'REQ-2',
          attemptId: 'AT-3',
          deviceMac: '11:22:33:44:55:66',
          errorCode: 9,
          reason_code: 'HTTP_TIMEOUT',
          topic: 'data_reply/SN-2',
        },
      }),
    ).toEqual({
      ...empty,
      linkCode: 'LC-2',
      requestId: 'REQ-2',
      attemptId: 'AT-3',
      deviceMac: '11:22:33:44:55:66',
      deviceSn: 'SN-2',
      errorCode: '9',
      reasonCode: 'HTTP_TIMEOUT',
      stage: 'http',
      op: 'request',
      result: 'fail',
    });
  });

  it('extracts SDK legacy alias keys used by EventLogger', () => {
    expect(
      extractTrackingFields({
        data: {
          Stage: 'MQTT',
          Op: 'ACK',
          Result: 'TIMEOUT',
          link_code: 'LC-legacy',
          msg_id: 'MSG-legacy',
          attempt_id: 'AT-legacy',
          serialNumber: 'SN-legacy',
          mac: 'AABBCCDDEEFF',
          reason_code: 'ACK_TIMEOUT',
        },
      }),
    ).toEqual({
      ...empty,
      linkCode: 'LC-legacy',
      requestId: 'MSG-legacy',
      attemptId: 'AT-legacy',
      deviceMac: 'AABBCCDDEEFF',
      deviceSn: 'SN-legacy',
      reasonCode: 'ACK_TIMEOUT',
      stage: 'mqtt',
      op: 'ack',
      result: 'timeout',
    });
  });

  it('extracts upper-case alias keys and infers sn from Url query', () => {
    expect(
      extractTrackingFields({
        data: {
          DeviceMac: 'AA:BB:CC:DD:EE:FF',
          Url: 'https://api.example.com/client/log/upload?sn=SN-FROM-URL',
          ErrorCode: 'E-UPPER',
          reasonCode: 'LINK_LOSS',
        },
      }),
    ).toEqual({
      ...empty,
      deviceMac: 'AA:BB:CC:DD:EE:FF',
      deviceSn: 'SN-FROM-URL',
      errorCode: 'E-UPPER',
      reasonCode: 'LINK_LOSS',
    });
  });

  it('extracts fallback fields from deviceId', () => {
    expect(
      extractTrackingFields({
        data: {
          deviceId: 'AA:BB:CC:DD:EE:FF',
        },
      }),
    ).toEqual({
      ...empty,
      deviceMac: 'AA:BB:CC:DD:EE:FF',
    });

    expect(
      extractTrackingFields({
        data: {
          deviceId: 'SN-FROM-DEVICE-ID',
        },
      }),
    ).toEqual({
      ...empty,
      deviceSn: 'SN-FROM-DEVICE-ID',
    });
  });

  it('extracts error code from nested error object', () => {
    expect(
      extractTrackingFields({
        error: { code: 'E123', reason_code: 'BLE_TIMEOUT' },
      }),
    ).toEqual({
      ...empty,
      errorCode: 'E123',
      reasonCode: 'BLE_TIMEOUT',
    });
  });
});

describe('LogsParserService automation hooks', () => {
  function createService(params: { text: string }) {
    const logFile = {
      id: 'lf1',
      projectId: 'p1',
      storageKey: 'logs/p1/lf1.jsonl',
    };

    const prisma = {
      logFile: {
        findUnique: jest.fn().mockResolvedValue(logFile),
      },
      $transaction: jest.fn().mockImplementation(async (fn: unknown) => {
        const tx = {
          logEventStats: {
            deleteMany: jest.fn().mockResolvedValue(undefined),
            createMany: jest.fn().mockResolvedValue(undefined),
          },
          logEvent: {
            deleteMany: jest.fn().mockResolvedValue(undefined),
            createMany: jest.fn().mockResolvedValue(undefined),
          },
          logFile: {
            update: jest.fn().mockResolvedValue(undefined),
          },
        };
        const callback = fn as (tx: typeof tx) => Promise<void>;
        await callback(tx);
      }),
    } as unknown as PrismaService;

    const storage = {
      getObjectBuffer: jest
        .fn()
        .mockResolvedValue(Buffer.from(params.text, 'utf8')),
    } as unknown as StorageService;

    const audit = {
      record: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuditService;

    const loganDecrypt = {
      isLoganEncrypted: jest.fn().mockReturnValue(false),
      decrypt: jest.fn(),
    } as unknown as LoganDecryptService;

    const analyzer = {
      analyzeLogFile: jest.fn().mockResolvedValue(undefined),
    } as unknown as LogsAnalyzerService;

    const assertion = {
      runValidationInternal: jest.fn().mockResolvedValue(undefined),
    } as unknown as LogsAssertionService;

    const service = new LogsParserService(
      prisma,
      storage,
      audit,
      loganDecrypt,
      analyzer,
      assertion,
    );

    return { service, analyzer, assertion };
  }

  it('triggers assertion validation after successful parse/analyze', async () => {
    const inner = JSON.stringify({
      event: 'SDK init success',
      msg: { stage: 'ble', op: 'init', result: 'ok' },
    });
    const line = `${JSON.stringify({ c: inner, f: 2, l: 1700000000000 })}\n`;
    const { service, analyzer, assertion } = createService({ text: line });

    await service.processLogFile('lf1', { analyze: true });

    expect((analyzer.analyzeLogFile as jest.Mock).mock.calls.length).toBe(1);
    expect(
      (assertion.runValidationInternal as jest.Mock).mock.calls.length,
    ).toBe(1);
    expect(
      (assertion.runValidationInternal as jest.Mock).mock.calls[0][0],
    ).toEqual({
      projectId: 'p1',
      logFileId: 'lf1',
      triggeredBy: 'auto',
    });
  });

  it('does not trigger assertion validation when parse has errors', async () => {
    const { service, analyzer, assertion } = createService({
      text: 'not-json-line\n',
    });

    await service.processLogFile('lf1', { analyze: true });

    expect((analyzer.analyzeLogFile as jest.Mock).mock.calls.length).toBe(0);
    expect(
      (assertion.runValidationInternal as jest.Mock).mock.calls.length,
    ).toBe(0);
  });
});
