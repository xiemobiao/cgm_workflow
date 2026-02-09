type ContinuityIssueKind = 'orderBroken' | 'persistTimeout' | 'rtBufferDrop';

type ContinuityEvent = {
  timestampMs: number;
  deviceSn: string | null;
  linkCode: string | null;
  requestId: string | null;
  errorCode: string | null;
};

export type DataContinuityReport = {
  summary: {
    total: number;
    orderBroken: number;
    outOfOrderBuffered: number;
    duplicateDropped: number;
    persistTimeout: number;
    rtBufferDrop: number;
    issuesMissingDeviceSn: number;
    issuesMissingLinkCode: number;
    issuesMissingRequestId: number;
  };
  byDevice: Array<{
    deviceSn: string;
    total: number;
    orderBroken: number;
    outOfOrderBuffered: number;
    duplicateDropped: number;
    persistTimeout: number;
    rtBufferDrop: number;
  }>;
  byLinkCode: Array<{
    linkCode: string;
    total: number;
    orderBroken: number;
    outOfOrderBuffered: number;
    duplicateDropped: number;
    persistTimeout: number;
    rtBufferDrop: number;
  }>;
  byRequestId: Array<{
    requestId: string;
    total: number;
    orderBroken: number;
    outOfOrderBuffered: number;
    duplicateDropped: number;
    persistTimeout: number;
    rtBufferDrop: number;
  }>;
};

function kindFromErrorCode(
  errorCode: string | null,
): ContinuityIssueKind | null {
  switch (errorCode) {
    case 'DATA_STREAM_ORDER_BROKEN':
    case 'DATA_STREAM_OUT_OF_ORDER_BUFFERED':
    case 'DATA_STREAM_DUPLICATE_DROPPED':
      return 'orderBroken';
    case 'DATA_PERSIST_TIMEOUT':
      return 'persistTimeout';
    case 'V3_RT_BUFFER_DROP':
      return 'rtBufferDrop';
    default:
      return null;
  }
}

function emptyCounters() {
  return {
    total: 0,
    orderBroken: 0,
    outOfOrderBuffered: 0,
    duplicateDropped: 0,
    persistTimeout: 0,
    rtBufferDrop: 0,
  };
}

function bump(
  counters: ReturnType<typeof emptyCounters>,
  kind: ContinuityIssueKind,
  errorCode: string | null,
) {
  counters.total += 1;
  if (kind === 'orderBroken') {
    counters.orderBroken += 1;
    if (errorCode === 'DATA_STREAM_OUT_OF_ORDER_BUFFERED') {
      counters.outOfOrderBuffered += 1;
    }
    if (errorCode === 'DATA_STREAM_DUPLICATE_DROPPED') {
      counters.duplicateDropped += 1;
    }
  }
  if (kind === 'persistTimeout') {
    counters.persistTimeout += 1;
  }
  if (kind === 'rtBufferDrop') {
    counters.rtBufferDrop += 1;
  }
}

export function buildDataContinuityReport(params: {
  events: ContinuityEvent[];
  topLimit?: number;
}): DataContinuityReport {
  const topLimit = params.topLimit ?? 10;
  const summary = {
    total: 0,
    orderBroken: 0,
    outOfOrderBuffered: 0,
    duplicateDropped: 0,
    persistTimeout: 0,
    rtBufferDrop: 0,
    issuesMissingDeviceSn: 0,
    issuesMissingLinkCode: 0,
    issuesMissingRequestId: 0,
  };

  const byDevice = new Map<string, ReturnType<typeof emptyCounters>>();
  const byLinkCode = new Map<string, ReturnType<typeof emptyCounters>>();
  const byRequestId = new Map<string, ReturnType<typeof emptyCounters>>();

  for (const e of params.events) {
    const kind = kindFromErrorCode(e.errorCode);
    if (!kind) continue;

    bump(summary, kind, e.errorCode);

    const sn = typeof e.deviceSn === 'string' ? e.deviceSn.trim() : '';
    const linkCode = typeof e.linkCode === 'string' ? e.linkCode.trim() : '';
    const requestId = typeof e.requestId === 'string' ? e.requestId.trim() : '';

    if (!sn) {
      summary.issuesMissingDeviceSn += 1;
    } else {
      const row = byDevice.get(sn) ?? emptyCounters();
      bump(row, kind, e.errorCode);
      byDevice.set(sn, row);
    }

    if (!linkCode) {
      summary.issuesMissingLinkCode += 1;
    } else {
      const row = byLinkCode.get(linkCode) ?? emptyCounters();
      bump(row, kind, e.errorCode);
      byLinkCode.set(linkCode, row);
    }

    if (!requestId) {
      summary.issuesMissingRequestId += 1;
    } else {
      const row = byRequestId.get(requestId) ?? emptyCounters();
      bump(row, kind, e.errorCode);
      byRequestId.set(requestId, row);
    }
  }

  const sortRows = <T extends { total: number }>(rows: T[]): T[] =>
    rows.sort((a, b) => (b.total !== a.total ? b.total - a.total : 0));

  const deviceRows = sortRows(
    Array.from(byDevice.entries()).map(([deviceSn, c]) => ({ deviceSn, ...c })),
  ).slice(0, topLimit);

  const linkRows = sortRows(
    Array.from(byLinkCode.entries()).map(([linkCode, c]) => ({
      linkCode,
      ...c,
    })),
  ).slice(0, topLimit);

  const requestRows = sortRows(
    Array.from(byRequestId.entries()).map(([requestId, c]) => ({
      requestId,
      ...c,
    })),
  ).slice(0, topLimit);

  return {
    summary,
    byDevice: deviceRows,
    byLinkCode: linkRows,
    byRequestId: requestRows,
  };
}
