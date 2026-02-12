#!/usr/bin/env node

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3001';
const SMOKE_EMAIL = process.env.SMOKE_EMAIL ?? 'admin@local.dev';
const SMOKE_PASSWORD = process.env.SMOKE_PASSWORD ?? 'admin123456';
const SMOKE_PROJECT_ID = process.env.SMOKE_PROJECT_ID ?? '';
const SMOKE_TIMEOUT_MS = Number.parseInt(
  process.env.SMOKE_TIMEOUT_MS ?? '300000',
  10,
);
const SMOKE_POLL_INTERVAL_MS = Number.parseInt(
  process.env.SMOKE_POLL_INTERVAL_MS ?? '1500',
  10,
);
const SMOKE_DELETE_FILE = process.env.SMOKE_DELETE_FILE === 'true';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function unwrapResponse(body) {
  if (body && typeof body === 'object' && 'success' in body) {
    if (body.success === true) return body.data;
    const error = body.error ? JSON.stringify(body.error) : 'unknown error';
    throw new Error(`API error: ${error}`);
  }
  return body;
}

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, options);
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }

  if (!response.ok) {
    throw new Error(
      `${options.method ?? 'GET'} ${path} -> ${response.status} ${response.statusText} ${text}`,
    );
  }

  return unwrapResponse(body);
}

async function main() {
  console.log(`Smoke target: ${API_BASE_URL}`);

  const login = await apiRequest('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: SMOKE_EMAIL,
      password: SMOKE_PASSWORD,
    }),
  });

  const token = login?.token;
  assert(typeof token === 'string' && token.length > 0, 'Login token missing');
  const authHeaders = { Authorization: `Bearer ${token}` };

  const projects = await apiRequest('/api/projects', { headers: authHeaders });
  const projectItems = Array.isArray(projects?.items)
    ? projects.items
    : Array.isArray(projects)
      ? projects
      : [];
  assert(projectItems.length > 0, 'No project found for smoke test');

  const project =
    projectItems.find((item) => item?.id === SMOKE_PROJECT_ID) ?? projectItems[0];
  assert(project?.id, 'Project id missing');

  const now = Date.now();
  const payloads = [
    {
      event: 'BLE connect start',
      msg: {
        stage: 'ble',
        op: 'connect',
        result: 'start',
        linkCode: 'LC-SMOKE-1',
        requestId: 'REQ-SMOKE-1',
        attemptId: 'AT-SMOKE-1',
        deviceSn: 'SN-SMOKE-1',
      },
    },
    {
      event: 'BLE connect failed',
      msg: {
        stage: 'ble',
        op: 'connect',
        result: 'fail',
        reasonCode: 'LINK_LOSS',
        linkCode: 'LC-SMOKE-1',
        requestId: 'REQ-SMOKE-1',
        attemptId: 'AT-SMOKE-1',
        deviceSn: 'SN-SMOKE-1',
      },
    },
    {
      event: 'HTTP request failed',
      msg: {
        stage: 'http',
        op: 'request',
        result: 'timeout',
        reasonCode: 'HTTP_TIMEOUT',
        linkCode: 'LC-SMOKE-1',
        requestId: 'REQ-SMOKE-2',
        attemptId: 'AT-SMOKE-2',
        deviceSn: 'SN-SMOKE-1',
      },
    },
    {
      event: 'MQTT ack timeout',
      msg: {
        stage: 'mqtt',
        op: 'ack',
        result: 'timeout',
        reasonCode: 'ACK_TIMEOUT',
        linkCode: 'LC-SMOKE-1',
        requestId: 'REQ-SMOKE-3',
        attemptId: 'AT-SMOKE-3',
        deviceSn: 'SN-SMOKE-1',
      },
    },
  ];

  const jsonl =
    payloads
      .map((item, index) =>
        JSON.stringify({
          l: now + index,
          f: index + 1,
          c: JSON.stringify({
            event: item.event,
            msg: item.msg,
            sdkInfo: 'v3.5.1',
            terminalInfo: 'Smoke Device',
            appInfo: 'reason-smoke',
          }),
          n: 'main',
          i: 1,
          m: true,
        }),
      )
      .join('\n') + '\n';

  const formData = new FormData();
  formData.set('projectId', project.id);
  formData.set(
    'file',
    new Blob([jsonl], { type: 'text/plain' }),
    `reason-smoke-${Date.now()}.jsonl`,
  );

  const upload = await apiRequest('/api/logs/upload', {
    method: 'POST',
    headers: authHeaders,
    body: formData,
  });
  const logFileId = upload?.logFileId;
  assert(typeof logFileId === 'string' && logFileId.length > 0, 'Upload failed');
  console.log(`Uploaded logFileId: ${logFileId}`);

  const startedAt = Date.now();
  let detail = null;
  while (Date.now() - startedAt < SMOKE_TIMEOUT_MS) {
    detail = await apiRequest(`/api/logs/files/${logFileId}`, {
      headers: authHeaders,
    });
    if (detail?.status === 'parsed' || detail?.status === 'failed') break;
    await new Promise((resolve) => setTimeout(resolve, SMOKE_POLL_INTERVAL_MS));
  }

  assert(detail, 'No parse result received');
  assert(
    detail.status === 'parsed',
    `Parse failed, status=${detail.status ?? 'unknown'}`,
  );

  const reasonSummary = await apiRequest(`/api/logs/files/${logFileId}/reason-codes`, {
    headers: authHeaders,
  });
  assert(
    Number(reasonSummary?.reasonCodeEvents ?? 0) > 0,
    'reasonCode summary has no events',
  );

  const stageOp = Array.isArray(reasonSummary?.topStageOpResults)
    ? reasonSummary.topStageOpResults.find(
        (item) =>
          item?.stage &&
          item?.op &&
          item?.result &&
          Array.isArray(item?.topReasonCodes) &&
          item.topReasonCodes.length > 0 &&
          item.topReasonCodes[0]?.reasonCode,
      )
    : null;
  assert(stageOp, 'No valid stage/op/result group in summary');
  const reasonCode = stageOp.topReasonCodes[0].reasonCode;

  const searchParams = new URLSearchParams({
    projectId: project.id,
    logFileId,
    startTime: new Date(now - 60_000).toISOString(),
    endTime: new Date(now + 60_000).toISOString(),
    stage: stageOp.stage,
    op: stageOp.op,
    result: stageOp.result,
    reasonCode,
    limit: '200',
  });

  const search = await apiRequest(`/api/logs/events/search?${searchParams.toString()}`, {
    headers: authHeaders,
  });
  const items = Array.isArray(search?.items) ? search.items : [];
  assert(items.length > 0, 'events/search returned no matches');

  console.log('Smoke result: PASS');
  console.log(
    JSON.stringify(
      {
        projectId: project.id,
        logFileId,
        reasonCodeEvents: reasonSummary.reasonCodeEvents,
        coverageRatio: reasonSummary.coverageRatio,
        filter: {
          stage: stageOp.stage,
          op: stageOp.op,
          result: stageOp.result,
          reasonCode,
        },
        hitCount: items.length,
        analysisUrl: `/logs/files/${logFileId}/analysis`,
      },
      null,
      2,
    ),
  );

  if (SMOKE_DELETE_FILE) {
    await apiRequest(`/api/logs/files/${logFileId}`, {
      method: 'DELETE',
      headers: authHeaders,
    });
    console.log(`Cleanup done: ${logFileId}`);
  }
}

main().catch((error) => {
  console.error(`Smoke result: FAIL\n${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
