import { buildDataContinuityReport } from './data-continuity';

describe('buildDataContinuityReport', () => {
  it('aggregates continuity issues by deviceSn and linkCode', () => {
    const report = buildDataContinuityReport({
      events: [
        {
          timestampMs: 1000,
          deviceSn: 'SN-A',
          linkCode: 'lc-1',
          requestId: 'req-1',
          errorCode: 'DATA_STREAM_ORDER_BROKEN',
        },
        {
          timestampMs: 1050,
          deviceSn: 'SN-A',
          linkCode: 'lc-1',
          requestId: 'req-1',
          errorCode: 'DATA_STREAM_OUT_OF_ORDER_BUFFERED',
        },
        {
          timestampMs: 1060,
          deviceSn: 'SN-A',
          linkCode: 'lc-1',
          requestId: 'req-1',
          errorCode: 'DATA_STREAM_DUPLICATE_DROPPED',
        },
        {
          timestampMs: 1100,
          deviceSn: 'SN-A',
          linkCode: 'lc-1',
          requestId: 'req-1',
          errorCode: 'DATA_PERSIST_TIMEOUT',
        },
        {
          timestampMs: 1200,
          deviceSn: 'SN-B',
          linkCode: 'lc-2',
          requestId: 'req-2',
          errorCode: 'V3_RT_BUFFER_DROP',
        },
        {
          timestampMs: 1300,
          deviceSn: null,
          linkCode: null,
          requestId: null,
          errorCode: 'DATA_PERSIST_TIMEOUT',
        },
      ],
    });

    expect(report.summary.total).toBe(6);
    expect(report.summary.orderBroken).toBe(3);
    expect(report.summary.outOfOrderBuffered).toBe(1);
    expect(report.summary.duplicateDropped).toBe(1);
    expect(report.summary.persistTimeout).toBe(2);
    expect(report.summary.rtBufferDrop).toBe(1);
    expect(report.summary.issuesMissingDeviceSn).toBe(1);
    expect(report.summary.issuesMissingLinkCode).toBe(1);
    expect(report.summary.issuesMissingRequestId).toBe(1);

    const snA = report.byDevice.find((d) => d.deviceSn === 'SN-A');
    expect(snA?.total).toBe(4);
    expect(snA?.orderBroken).toBe(3);
    expect(snA?.outOfOrderBuffered).toBe(1);
    expect(snA?.duplicateDropped).toBe(1);
    expect(snA?.persistTimeout).toBe(1);

    const lc1 = report.byLinkCode.find((d) => d.linkCode === 'lc-1');
    expect(lc1?.total).toBe(4);
    expect(lc1?.orderBroken).toBe(3);
    expect(lc1?.outOfOrderBuffered).toBe(1);
    expect(lc1?.duplicateDropped).toBe(1);
    expect(lc1?.persistTimeout).toBe(1);

    const req1 = report.byRequestId.find((d) => d.requestId === 'req-1');
    expect(req1?.total).toBe(4);
    expect(req1?.orderBroken).toBe(3);
    expect(req1?.outOfOrderBuffered).toBe(1);
    expect(req1?.duplicateDropped).toBe(1);
    expect(req1?.persistTimeout).toBe(1);
  });
});
