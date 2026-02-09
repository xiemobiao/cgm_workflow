import { extractTrackingFields } from './logs.parser.service';

describe('extractTrackingFields', () => {
  const empty = {
    linkCode: null,
    requestId: null,
    attemptId: null,
    deviceMac: null,
    deviceSn: null,
    errorCode: null,
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
      }),
    ).toEqual({
      ...empty,
      linkCode: 'LC-1',
      requestId: 'REQ-1',
      attemptId: 'AT-2',
      deviceMac: 'AA:BB:CC:DD:EE:FF',
      deviceSn: 'SN-1',
      errorCode: 'E8',
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
          requestId: 'REQ-2',
          attemptId: 'AT-3',
          deviceMac: '11:22:33:44:55:66',
          errorCode: 9,
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
      stage: 'http',
      op: 'request',
      result: 'fail',
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
        error: { code: 'E123' },
      }),
    ).toEqual({
      ...empty,
      errorCode: 'E123',
    });
  });
});
