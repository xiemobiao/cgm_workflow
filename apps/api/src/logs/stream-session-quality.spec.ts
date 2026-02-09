import { buildStreamSessionQualityReport } from './stream-session-quality';

describe('buildStreamSessionQualityReport', () => {
  it('summarizes session events and parses fields from msgJson', () => {
    const report = buildStreamSessionQualityReport({
      topLimit: 10,
      sessionsLimit: 10,
      events: [
        {
          timestampMs: 1000,
          deviceSn: 'SN-A',
          linkCode: 'lc-1',
          requestId: 'req-1',
          msgJson: {
            reason: 'releaseFetchSession',
            rawStartIndex: 100,
            nextExpectedRaw: 110,
            lastRaw: 109,
            bufferedOutOfOrderCount: 2,
            persistedMax: 109,
            pendingCallbacks: 0,
            sessionStartIndex: 100,
            sessionStartAtMs: 900,
            sessionElapsedMs: 100,
          },
        },
        {
          timestampMs: 1100,
          deviceSn: 'SN-A',
          linkCode: 'lc-1',
          requestId: '',
          msgJson:
            'reason:disconnectDueToDataIssue rawStartIndex:200 sessionStartIndex:200',
        },
        {
          timestampMs: 1200,
          deviceSn: null,
          linkCode: null,
          requestId: null,
          msgJson: { rawStartIndex: 300 },
        },
      ],
    });

    expect(report.summary.total).toBe(3);
    expect(report.summary.issuesMissingDeviceSn).toBe(1);
    expect(report.summary.issuesMissingLinkCode).toBe(1);
    expect(report.summary.issuesMissingRequestId).toBe(2);
    expect(report.summary.issuesMissingReason).toBe(1);
    expect(report.summary.issuesMissingSessionStartIndex).toBe(1);
    expect(report.summary.issuesMissingSessionStartAtMs).toBe(2);
    expect(report.summary.thresholdWarnBelow).toBe(80);
    expect(report.summary.thresholdBadBelow).toBe(60);
    expect(report.summary.scoreAvg).toBe(59);
    expect(report.summary.qualityGood).toBe(1);
    expect(report.summary.qualityWarn).toBe(0);
    expect(report.summary.qualityBad).toBe(2);

    expect(report.byDevice).toEqual([{ deviceSn: 'SN-A', total: 2 }]);
    expect(report.byLinkCode).toEqual([{ linkCode: 'lc-1', total: 2 }]);
    expect(report.byRequestId).toEqual([{ requestId: 'req-1', total: 1 }]);

    const reasons = report.byReason.map((r) => `${r.reason}:${r.total}`).sort();
    expect(reasons).toEqual([
      'disconnectDueToDataIssue:1',
      'releaseFetchSession:1',
    ]);

    expect(report.sessions[0]?.timestampMs).toBe(1200);
    expect(report.sessions[0]?.rawStartIndex).toBe(300);
    expect(report.sessions[0]?.score).toBe(30);
    expect(report.sessions[0]?.quality).toBe('bad');
    expect(report.sessions[1]?.reason).toBe('disconnectDueToDataIssue');
    expect(report.sessions[1]?.sessionStartIndex).toBe(200);
    expect(report.sessions[1]?.score).toBe(50);
    expect(report.sessions[1]?.quality).toBe('bad');
    expect(report.sessions[2]?.reason).toBe('releaseFetchSession');
    expect(report.sessions[2]?.score).toBe(96);
    expect(report.sessions[2]?.quality).toBe('good');
  });
});
