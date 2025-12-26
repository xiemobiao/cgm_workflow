import { extractTrackingFields } from './logs.parser.service';

describe('extractTrackingFields', () => {
  it('returns nulls for unsupported msg', () => {
    expect(extractTrackingFields(null)).toEqual({
      linkCode: null,
      requestId: null,
      deviceMac: null,
      deviceSn: null,
      errorCode: null,
    });
    expect(extractTrackingFields('x')).toEqual({
      linkCode: null,
      requestId: null,
      deviceMac: null,
      deviceSn: null,
      errorCode: null,
    });
    expect(extractTrackingFields(123)).toEqual({
      linkCode: null,
      requestId: null,
      deviceMac: null,
      deviceSn: null,
      errorCode: null,
    });
  });

  it('extracts fields from string key-value tokens', () => {
    expect(
      extractTrackingFields(
        'linkCode=LC-STR requestId=REQ-STR mac=AA:BB:CC:DD:EE:FF sn=SN-STR code=E1',
      ),
    ).toEqual({
      linkCode: 'LC-STR',
      requestId: 'REQ-STR',
      deviceMac: 'AA:BB:CC:DD:EE:FF',
      deviceSn: 'SN-STR',
      errorCode: 'E1',
    });
  });

  it('parses JSON string msg', () => {
    expect(extractTrackingFields('{"deviceSn":"SN-J","linkCode":"LC-J"}')).toEqual({
      linkCode: 'LC-J',
      requestId: null,
      deviceMac: null,
      deviceSn: 'SN-J',
      errorCode: null,
    });
  });

  it('derives deviceSn from mqtt topic', () => {
    expect(extractTrackingFields('topic=data_reply/SN-XYZ msgId=1')).toEqual({
      linkCode: null,
      requestId: '1',
      deviceMac: null,
      deviceSn: 'SN-XYZ',
      errorCode: null,
    });
  });

  it('extracts fields from top-level keys', () => {
    expect(
      extractTrackingFields({
        linkCode: 'LC-1',
        requestId: 'REQ-1',
        mac: 'AA:BB:CC:DD:EE:FF',
        code: 'E8',
      }),
    ).toEqual({
      linkCode: 'LC-1',
      requestId: 'REQ-1',
      deviceMac: 'AA:BB:CC:DD:EE:FF',
      deviceSn: null,
      errorCode: 'E8',
    });
  });

  it('extracts fields from nested msg.data', () => {
    expect(
      extractTrackingFields({
        data: {
          linkCode: 'LC-2',
          request_id: 'REQ-2',
          deviceId: '11:22:33:44:55:66',
          error_code: 9,
        },
      }),
    ).toEqual({
      linkCode: 'LC-2',
      requestId: 'REQ-2',
      deviceMac: '11:22:33:44:55:66',
      deviceSn: null,
      errorCode: '9',
    });
  });

  it('treats non-mac deviceId as deviceSn', () => {
    expect(
      extractTrackingFields({
        deviceId: 'SN12345678',
      }),
    ).toEqual({
      linkCode: null,
      requestId: null,
      deviceMac: null,
      deviceSn: 'SN12345678',
      errorCode: null,
    });
  });

  it('extracts error code from nested error object', () => {
    expect(
      extractTrackingFields({
        error: { code: 'E123' },
      }),
    ).toEqual({
      linkCode: null,
      requestId: null,
      deviceMac: null,
      deviceSn: null,
      errorCode: 'E123',
    });
  });

  it('supports DeviceMac legacy key', () => {
    expect(
      extractTrackingFields({
        DeviceMac: 'AA:AA:AA:AA:AA:AA',
      }),
    ).toEqual({
      linkCode: null,
      requestId: null,
      deviceMac: 'AA:AA:AA:AA:AA:AA',
      deviceSn: null,
      errorCode: null,
    });
  });

  it('extracts deviceSn from multiple aliases', () => {
    expect(
      extractTrackingFields({
        deviceSn: 'SN-A',
      }),
    ).toEqual({
      linkCode: null,
      requestId: null,
      deviceMac: null,
      deviceSn: 'SN-A',
      errorCode: null,
    });

    expect(
      extractTrackingFields({
        serialNumber: 'SN-B',
      }),
    ).toEqual({
      linkCode: null,
      requestId: null,
      deviceMac: null,
      deviceSn: 'SN-B',
      errorCode: null,
    });
  });
});
