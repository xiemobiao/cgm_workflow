'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import shellStyles from '@/components/AppShell.module.css';
import formStyles from '@/components/Form.module.css';
import { ProjectPicker } from '@/components/ProjectPicker';
import { ApiClientError, apiFetch } from '@/lib/api';
import { API_BASE_URL } from '@/lib/config';
import { getProjectId, getToken } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';

type UploadResponse = { logFileId: string; status: string };
type SearchItem = {
  id: string;
  eventName: string;
  level: number;
  timestampMs: number;
  sdkVersion: string | null;
  appId: string | null;
  logFileId: string;
  msg: string | null;
};
type SearchResponse = { items: SearchItem[]; nextCursor: string | null };
type EventContextResponse = {
  logFileId: string;
  before: SearchItem[];
  after: SearchItem[];
};

type LogFileDetail = {
  id: string;
  fileName: string;
  status: 'queued' | 'parsed' | 'failed';
  parserVersion: string | null;
  uploadedAt: string;
  eventCount: number;
  errorCount: number;
  minTimestampMs: number | null;
  maxTimestampMs: number | null;
};

type LogEventDetail = {
  id: string;
  logFileId: string;
  timestampMs: number;
  level: number;
  eventName: string;
  sdkVersion: string | null;
  appId: string | null;
  terminalInfo: string | null;
  threadName: string | null;
  threadId: number | null;
  isMainThread: boolean | null;
  msg: string | null;
  msgJson: unknown | null;
  rawLine: string | null;
  createdAt: string;
};

function toIsoFromDatetimeLocal(value: string) {
  const d = new Date(value);
  return d.toISOString();
}

function formatDatetimeLocal(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function shortenText(value: string | null, maxLen: number) {
  if (!value) return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, Math.max(0, maxLen - 1))}…`;
}

function renderHighlighted(text: string, needle: string): ReactNode {
  const q = needle.trim();
  if (!q) return text;

  const re = new RegExp(escapeRegExp(q), 'ig');
  const out: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null = null;
  let i = 0;

  while ((match = re.exec(text)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (start > lastIndex) out.push(text.slice(lastIndex, start));
    out.push(
      <mark key={`${start}-${i}`} className={shellStyles.highlight}>
        {text.slice(start, end)}
      </mark>,
    );
    lastIndex = end;
    i += 1;
    if (re.lastIndex === match.index) re.lastIndex += 1;
  }

  if (lastIndex < text.length) out.push(text.slice(lastIndex));
  return out.length ? out : text;
}

export default function LogsPage() {
  const { localeTag, t } = useI18n();
  const [projectId, setProjectId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploadResult, setUploadResult] = useState('');
  const [uploadedLogFileId, setUploadedLogFileId] = useState<string | null>(null);
  const [uploadedLogFile, setUploadedLogFile] = useState<LogFileDetail | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [eventName, setEventName] = useState('');
  const [keyword, setKeyword] = useState('');
  const [logFileId, setLogFileId] = useState('');
  const [level, setLevel] = useState<string>('');
  const [sdkVersion, setSdkVersion] = useState('');
  const [appId, setAppId] = useState('');
  const [limit, setLimit] = useState(50);
  const [startLocal, setStartLocal] = useState('');
  const [endLocal, setEndLocal] = useState('');
  const [autoSearch, setAutoSearch] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [results, setResults] = useState<SearchItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [detail, setDetail] = useState<LogEventDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [context, setContext] = useState<EventContextResponse | null>(null);
  const [contextLoading, setContextLoading] = useState(false);
  const [contextError, setContextError] = useState('');
  const [copyHint, setCopyHint] = useState('');
  const searchRef = useRef<
    (
      resetCursor: boolean,
      range?: { startLocal: string; endLocal: string },
    ) => Promise<void>
  >(async () => {});

  useEffect(() => {
    const id = window.setTimeout(() => {
      setProjectId(getProjectId() ?? '');
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  const canSearch = useMemo(() => Boolean(projectId), [projectId]);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const startMs = Number(sp.get('startMs') ?? '');
    const endMs = Number(sp.get('endMs') ?? '');
    if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs) {
      setStartLocal(formatDatetimeLocal(new Date(startMs)));
      setEndLocal(formatDatetimeLocal(new Date(endMs)));
      return;
    }

    const now = new Date();
    setEndLocal(formatDatetimeLocal(now));
    setStartLocal(formatDatetimeLocal(new Date(now.getTime() - 24 * 60 * 60 * 1000)));
  }, []);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const urlLogFileId = sp.get('logFileId');
    if (urlLogFileId && isUuid(urlLogFileId)) setLogFileId(urlLogFileId);
    const urlKeyword = sp.get('q');
    if (urlKeyword) setKeyword(urlKeyword);

    const startMs = Number(sp.get('startMs') ?? '');
    const endMs = Number(sp.get('endMs') ?? '');
    const hasRange = Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs;
    if ((urlLogFileId && isUuid(urlLogFileId)) || urlKeyword || hasRange) {
      setAutoSearch(true);
    }
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem('cgm_logs_limit');
    const n = saved ? Number(saved) : NaN;
    if (Number.isFinite(n) && n >= 1 && n <= 1000) {
      setLimit(Math.trunc(n));
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('cgm_logs_limit', String(limit));
  }, [limit]);

  useEffect(() => {
    if (!selectedEventId) return;
    let cancelled = false;
    setDetail(null);
    setDetailError('');
    setContext(null);
    setContextError('');
    setCopyHint('');
    setDetailLoading(true);
    apiFetch<LogEventDetail>(`/api/logs/events/${selectedEventId}`)
      .then((data) => {
        if (cancelled) return;
        setDetail(data);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const msg =
          e instanceof ApiClientError ? `${e.code}: ${e.message}` : String(e);
        setDetailError(msg);
      })
      .finally(() => {
        if (cancelled) return;
        setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedEventId]);

  useEffect(() => {
    if (!selectedEventId) return;
    let cancelled = false;
    setContext(null);
    setContextError('');
    setContextLoading(true);
    apiFetch<EventContextResponse>(`/api/logs/events/${selectedEventId}/context?before=8&after=8`)
      .then((data) => {
        if (cancelled) return;
        setContext(data);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const msg = e instanceof ApiClientError ? `${e.code}: ${e.message}` : String(e);
        setContextError(msg);
      })
      .finally(() => {
        if (cancelled) return;
        setContextLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedEventId]);

  useEffect(() => {
    if (!uploadedLogFileId) return;

    let cancelled = false;
    let timer: number | null = null;
    let tries = 0;

    const poll = async () => {
      tries += 1;
      try {
        const info = await apiFetch<LogFileDetail>(`/api/logs/files/${uploadedLogFileId}`);
        if (cancelled) return;
        setUploadedLogFile(info);

        if (info.status !== 'queued' || tries >= 30) {
          if (timer) window.clearInterval(timer);
        }
      } catch {
        if (cancelled) return;
        if (tries >= 5 && timer) window.clearInterval(timer);
      }
    };

    void poll();
    timer = window.setInterval(() => void poll(), 1200);

    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
    };
  }, [uploadedLogFileId]);

  function setPresetRange(hours: number) {
    const now = new Date();
    setEndLocal(formatDatetimeLocal(now));
    setStartLocal(formatDatetimeLocal(new Date(now.getTime() - hours * 60 * 60 * 1000)));
  }

  function prettyJson(value: unknown) {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  async function copyText(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopyHint(t('common.copied'));
    } catch {
      setCopyHint(t('common.copyFailed'));
    }
  }

  async function upload() {
    if (!projectId || !file) return;
    setLoading(true);
    setError('');
    setUploadResult('');
    setUploadedLogFileId(null);
    setUploadedLogFile(null);
    try {
      const token = getToken();
      if (!token) throw new Error('Missing token');

      const form = new FormData();
      form.set('projectId', projectId);
      form.set('file', file);

      const res = await fetch(`${API_BASE_URL}/api/logs/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const json = (await res.json()) as unknown;
      if (!json || typeof json !== 'object') {
        throw new Error(`Invalid response (${res.status})`);
      }
      const body = json as {
        success: boolean;
        data: UploadResponse | null;
        error: { code: string; message: string } | null;
      };
      if (!body.success || !body.data) {
        throw new Error(`${body.error?.code ?? `HTTP_${res.status}`}: ${body.error?.message ?? 'Upload failed'}`);
      }

      setUploadResult(`logFileId=${body.data.logFileId}, status=${body.data.status}`);
      setUploadedLogFileId(body.data.logFileId);
      setLogFileId(body.data.logFileId);
      const now = new Date();
      const end = formatDatetimeLocal(now);
      const start = formatDatetimeLocal(new Date(now.getTime() - 24 * 60 * 60 * 1000));
      setStartLocal(start);
      setEndLocal(end);

      window.setTimeout(() => {
        void search(true, { startLocal: start, endLocal: end });
      }, 1200);
    } catch (e: unknown) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function search(resetCursor: boolean, range?: { startLocal: string; endLocal: string }) {
    if (!projectId) return;
    setLoading(true);
    setError('');
    try {
      const startValue = range?.startLocal ?? startLocal;
      const endValue = range?.endLocal ?? endLocal;
      if (!startValue || !endValue) {
        setError(t('logs.timeRangeRequired'));
        return;
      }
      const startMs = new Date(startValue).getTime();
      const endMs = new Date(endValue).getTime();
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
        setError(t('logs.timeRangeRequired'));
        return;
      }
      if (endMs <= startMs) {
        setError(t('logs.invalidTimeRange'));
        return;
      }

      const trimmedLogFileId = logFileId.trim();
      if (trimmedLogFileId && !isUuid(trimmedLogFileId)) {
        setError(t('logs.invalidLogFileId'));
        return;
      }

      const startTime = toIsoFromDatetimeLocal(startValue);
      const endTime = toIsoFromDatetimeLocal(endValue);
      const qs = new URLSearchParams({
        projectId,
        startTime,
        endTime,
      });
      if (eventName.trim()) qs.set('eventName', eventName.trim());
      if (trimmedLogFileId) qs.set('logFileId', trimmedLogFileId);
      if (keyword.trim()) qs.set('q', keyword.trim());
      if (sdkVersion.trim()) qs.set('sdkVersion', sdkVersion.trim());
      if (appId.trim()) qs.set('appId', appId.trim());
      if (level) qs.set('level', level);
      qs.set('limit', String(limit));
      if (!resetCursor && cursor) qs.set('cursor', cursor);

      const data = await apiFetch<SearchResponse>(`/api/logs/events/search?${qs.toString()}`);
      if (resetCursor) {
        setCursor(null);
        setNextCursor(null);
        setResults(data.items);
      } else {
        setResults((prev) => [...prev, ...data.items]);
      }
      setNextCursor(data.nextCursor);
      setCursor(data.nextCursor);
    } catch (e: unknown) {
      const msg = e instanceof ApiClientError ? `${e.code}: ${e.message}` : String(e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  searchRef.current = search;

  useEffect(() => {
    if (!autoSearch) return;
    if (!projectId) return;
    if (!startLocal || !endLocal) return;
    setAutoSearch(false);
    void searchRef.current(true);
  }, [autoSearch, projectId, startLocal, endLocal, keyword, logFileId]);

  return (
    <div className={shellStyles.grid}>
      <div className={shellStyles.card}>
        <div className={formStyles.row} style={{ justifyContent: 'space-between' }}>
          <h1 style={{ fontSize: 20, marginBottom: 0 }}>{t('logs.title')}</h1>
          <Link href="/logs/files" className={shellStyles.button}>
            {t('logs.files.browse')}
          </Link>
        </div>
        <div className={formStyles.row}>
          <ProjectPicker projectId={projectId} onChange={setProjectId} />
        </div>

        <div className={shellStyles.grid} style={{ marginTop: 10 }}>
          <div className={formStyles.field}>
            <div className={formStyles.label}>{t('logs.uploadTitle')}</div>
            <input
              className={formStyles.input}
              type="file"
              accept=".jsonl,application/json,text/plain"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <div className={formStyles.muted}>
              {t('logs.uploadHint')}
            </div>
          </div>
          <div className={formStyles.row}>
            <button
              className={shellStyles.button}
              type="button"
              disabled={!projectId || !file || loading}
              onClick={() => void upload()}
            >
              {t('common.upload')}
            </button>
            {uploadResult ? <div className={formStyles.success}>{uploadResult}</div> : null}
            {uploadedLogFile ? (
              <div className={formStyles.muted}>
                {t('logs.fileStatus')}:{' '}
                <span
                  className={`${shellStyles.badge}${uploadedLogFile.status === 'failed' ? ` ${shellStyles.badgeDanger}` : ''}`}
                >
                  {t(`logs.fileStatus.${uploadedLogFile.status}`)}
                </span>{' '}
                · {t('logs.fileStatus.events')}: {uploadedLogFile.eventCount} · {t('logs.fileStatus.errors')}: {uploadedLogFile.errorCount}
              </div>
            ) : null}
          </div>
        </div>

        <div className={shellStyles.grid} style={{ marginTop: 16 }}>
	          <div className={formStyles.row}>
	            <div className={formStyles.field}>
	              <div className={formStyles.label}>{t('logs.eventNameOptional')}</div>
	              <input
	                className={formStyles.input}
	                value={eventName}
	                onChange={(e) => setEventName(e.target.value)}
	                placeholder="e.g. SDK init start"
	              />
	            </div>
	            <div className={formStyles.field} style={{ minWidth: 220 }}>
	              <div className={formStyles.label}>{t('logs.keyword')}</div>
	              <input
	                className={formStyles.input}
	                value={keyword}
	                onChange={(e) => setKeyword(e.target.value)}
	                placeholder="e.g. error / timeout"
	              />
	            </div>
	            <div className={formStyles.field} style={{ minWidth: 260 }}>
	              <div className={formStyles.label}>{t('logs.logFileIdOptional')}</div>
	              <input
	                className={formStyles.input}
	                value={logFileId}
	                onChange={(e) => setLogFileId(e.target.value)}
	                placeholder="e.g. 50cda2fb-007d-4c08-b0c3-f4aa15ec562b"
	              />
	            </div>
	            <div className={formStyles.field} style={{ minWidth: 140 }}>
	              <div className={formStyles.label}>{t('logs.level')}</div>
	              <select
	                className={formStyles.select}
                value={level}
                onChange={(e) => setLevel(e.target.value)}
              >
                <option value="">{t('logs.level.all')}</option>
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
                <option value="4">4</option>
              </select>
            </div>
            <div className={formStyles.field} style={{ minWidth: 180 }}>
              <div className={formStyles.label}>{t('logs.sdkVersion')}</div>
              <input
                className={formStyles.input}
                value={sdkVersion}
                onChange={(e) => setSdkVersion(e.target.value)}
                placeholder="e.g. v3.5.1"
              />
            </div>
            <div className={formStyles.field} style={{ minWidth: 180 }}>
              <div className={formStyles.label}>{t('logs.appId')}</div>
              <input
                className={formStyles.input}
                value={appId}
                onChange={(e) => setAppId(e.target.value)}
                placeholder="e.g. com.example.app"
              />
            </div>
            <div className={formStyles.field}>
              <div className={formStyles.label}>{t('logs.startTime')}</div>
              <input
                className={formStyles.input}
                type="datetime-local"
                value={startLocal}
                onChange={(e) => setStartLocal(e.target.value)}
              />
            </div>
            <div className={formStyles.field}>
              <div className={formStyles.label}>{t('logs.endTime')}</div>
              <input
                className={formStyles.input}
                type="datetime-local"
                value={endLocal}
                onChange={(e) => setEndLocal(e.target.value)}
              />
            </div>
            <div className={formStyles.field} style={{ minWidth: 140 }}>
              <div className={formStyles.label}>{t('logs.limit')}</div>
              <input
                className={formStyles.input}
                type="number"
                min={1}
                max={1000}
                value={limit}
                onChange={(e) => {
                  const n = e.currentTarget.valueAsNumber;
                  if (!Number.isFinite(n)) return;
                  const next = Math.min(Math.max(Math.trunc(n), 1), 1000);
                  setLimit(next);
                }}
              />
            </div>
          </div>

          <div className={formStyles.row}>
            <button className={shellStyles.button} type="button" disabled={loading} onClick={() => setPresetRange(1)}>
              {t('logs.preset.1h')}
            </button>
            <button className={shellStyles.button} type="button" disabled={loading} onClick={() => setPresetRange(24)}>
              {t('logs.preset.24h')}
            </button>
            <button className={shellStyles.button} type="button" disabled={loading} onClick={() => setPresetRange(24 * 7)}>
              {t('logs.preset.7d')}
            </button>
            <button
              className={shellStyles.button}
              type="button"
              disabled={!canSearch || loading}
              onClick={() => {
                setEventName('PARSER_ERROR');
                window.setTimeout(() => {
                  void search(true);
                }, 0);
              }}
            >
              {t('logs.onlyParserError')}
            </button>
            <button
              className={shellStyles.button}
              type="button"
              disabled={!canSearch || loading}
              onClick={() => void search(true)}
            >
              {t('common.search')}
            </button>
            <button
              className={shellStyles.button}
              type="button"
              disabled={!canSearch || loading || !nextCursor}
              onClick={() => void search(false)}
            >
              {t('common.loadMore')}
            </button>
            <div className={formStyles.muted}>
              {loading ? t('common.loading') : t('common.items', { count: results.length })}
            </div>
          </div>
        </div>

        {error ? <div className={formStyles.error}>{error}</div> : null}
      </div>

      <div className={shellStyles.card}>
        <div className={shellStyles.tableWrap}>
          <table className={shellStyles.table}>
            <thead>
              <tr>
                <th>{t('table.time')}</th>
                <th>{t('table.event')}</th>
                <th>{t('table.level')}</th>
                <th>{t('table.sdk')}</th>
                <th>{t('table.app')}</th>
                <th>{t('table.id')}</th>
              </tr>
            </thead>
            <tbody>
              {results.map((e) => (
                <tr
                  key={e.id}
                  className={shellStyles.clickableRow}
                  onClick={() => setSelectedEventId(e.id)}
                >
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {new Date(e.timestampMs).toLocaleString(localeTag)}
                  </td>
	                  <td style={{ minWidth: 260 }}>
	                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
	                      {e.eventName === 'PARSER_ERROR' ? (
	                        <span className={`${shellStyles.badge} ${shellStyles.badgeDanger}`}>
	                          {t('logs.parserError')}
	                        </span>
	                      ) : null}
	                      <span>{renderHighlighted(e.eventName, keyword)}</span>
	                    </div>
	                    {e.msg ? (
	                      <div className={formStyles.muted} style={{ marginTop: 4 }}>
	                        {renderHighlighted(shortenText(e.msg, 140), keyword)}
	                      </div>
	                    ) : null}
	                  </td>
	                  <td>{e.level}</td>
	                  <td>{e.sdkVersion ?? '-'}</td>
	                  <td>{e.appId ?? '-'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <span className={formStyles.muted}>{e.id}</span>
                  </td>
                </tr>
              ))}
              {results.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: 10 }} className={formStyles.muted}>
                    {t('logs.empty')}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {selectedEventId ? (
        <>
          <div
            className={shellStyles.drawerOverlay}
            onClick={() => setSelectedEventId(null)}
          />
          <aside className={shellStyles.drawer} role="dialog" aria-modal="true">
            <div className={shellStyles.drawerHeader}>
              <div>
                <div className={shellStyles.drawerTitle}>{t('logs.detail.title')}</div>
                <div className={formStyles.muted}>
                  {detail ? detail.eventName : selectedEventId}
                </div>
              </div>
              <button
                className={shellStyles.button}
                type="button"
                onClick={() => setSelectedEventId(null)}
              >
                {t('logs.detail.close')}
              </button>
            </div>
            <div className={shellStyles.drawerBody}>
              {detailLoading ? <div className={formStyles.muted}>{t('common.loading')}</div> : null}
              {detailError ? <div className={formStyles.error}>{detailError}</div> : null}
              {detail ? (
                <>
	                  <div className={shellStyles.kvGrid}>
	                    <div className={shellStyles.kvKey}>eventName</div>
	                    <div className={shellStyles.kvValue}>{detail.eventName}</div>
	                    <div className={shellStyles.kvKey}>msg</div>
	                    <div className={shellStyles.kvValue}>
	                      {detail.msg ? renderHighlighted(detail.msg, keyword) : '-'}
	                    </div>
	                    <div className={shellStyles.kvKey}>timestamp</div>
	                    <div className={shellStyles.kvValue}>
	                      {new Date(detail.timestampMs).toLocaleString(localeTag)}
	                    </div>
                    <div className={shellStyles.kvKey}>level</div>
                    <div className={shellStyles.kvValue}>{detail.level}</div>
                    <div className={shellStyles.kvKey}>sdkVersion</div>
                    <div className={shellStyles.kvValue}>{detail.sdkVersion ?? '-'}</div>
                    <div className={shellStyles.kvKey}>appId</div>
                    <div className={shellStyles.kvValue}>{detail.appId ?? '-'}</div>
                    <div className={shellStyles.kvKey}>terminalInfo</div>
                    <div className={shellStyles.kvValue}>{detail.terminalInfo ?? '-'}</div>
                    <div className={shellStyles.kvKey}>thread</div>
                    <div className={shellStyles.kvValue}>
                      {detail.threadName ?? '-'}{detail.threadId !== null ? ` (#${detail.threadId})` : ''}{detail.isMainThread === null ? '' : detail.isMainThread ? ' · main' : ' · bg'}
                    </div>
                    <div className={shellStyles.kvKey}>logFileId</div>
                    <div className={shellStyles.kvValue}>{detail.logFileId}</div>
                    <div className={shellStyles.kvKey}>eventId</div>
                    <div className={shellStyles.kvValue}>{detail.id}</div>
                  </div>

	                  <div className={formStyles.row}>
	                    <button className={shellStyles.button} type="button" onClick={() => void copyText(detail.id)}>
	                      {t('logs.detail.copyEventId')}
	                    </button>
	                    <button className={shellStyles.button} type="button" onClick={() => void copyText(detail.logFileId)}>
	                      {t('logs.detail.copyLogFileId')}
	                    </button>
	                    {copyHint ? <div className={formStyles.success}>{copyHint}</div> : null}
	                  </div>

	                  <div className={shellStyles.grid}>
	                    <div className={formStyles.label}>{t('logs.detail.context')}</div>
	                    {contextLoading ? (
	                      <div className={formStyles.muted}>{t('common.loading')}</div>
	                    ) : null}
	                    {contextError ? <div className={formStyles.error}>{contextError}</div> : null}
	                    {context ? (
	                      <div className={shellStyles.tableWrap}>
	                        <table className={shellStyles.table}>
	                          <tbody>
	                            {context.before.map((e) => (
	                              <tr
	                                key={e.id}
	                                className={shellStyles.clickableRow}
	                                onClick={() => setSelectedEventId(e.id)}
	                              >
	                                <td style={{ whiteSpace: 'nowrap' }}>
	                                  {new Date(e.timestampMs).toLocaleString(localeTag)}
	                                </td>
	                                <td style={{ minWidth: 260 }}>
	                                  <div>{renderHighlighted(e.eventName, keyword)}</div>
	                                  {e.msg ? (
	                                    <div className={formStyles.muted} style={{ marginTop: 4 }}>
	                                      {renderHighlighted(shortenText(e.msg, 140), keyword)}
	                                    </div>
	                                  ) : null}
	                                </td>
	                                <td>{e.level}</td>
	                              </tr>
	                            ))}
	                            <tr>
	                              <td colSpan={3} className={formStyles.muted} style={{ padding: 10 }}>
	                                {t('logs.detail.current')}
	                              </td>
	                            </tr>
	                            {context.after.map((e) => (
	                              <tr
	                                key={e.id}
	                                className={shellStyles.clickableRow}
	                                onClick={() => setSelectedEventId(e.id)}
	                              >
	                                <td style={{ whiteSpace: 'nowrap' }}>
	                                  {new Date(e.timestampMs).toLocaleString(localeTag)}
	                                </td>
	                                <td style={{ minWidth: 260 }}>
	                                  <div>{renderHighlighted(e.eventName, keyword)}</div>
	                                  {e.msg ? (
	                                    <div className={formStyles.muted} style={{ marginTop: 4 }}>
	                                      {renderHighlighted(shortenText(e.msg, 140), keyword)}
	                                    </div>
	                                  ) : null}
	                                </td>
	                                <td>{e.level}</td>
	                              </tr>
	                            ))}
	                            {context.before.length === 0 && context.after.length === 0 ? (
	                              <tr>
	                                <td colSpan={3} style={{ padding: 10 }} className={formStyles.muted}>
	                                  {t('logs.detail.contextEmpty')}
	                                </td>
	                              </tr>
	                            ) : null}
	                          </tbody>
	                        </table>
	                      </div>
	                    ) : null}
	                  </div>

	                  <div className={shellStyles.grid}>
	                    <div className={formStyles.label}>{t('logs.detail.msgJson')}</div>
	                    <pre className={shellStyles.codeBlock}>
	                      {renderHighlighted(prettyJson(detail.msgJson), keyword)}
	                    </pre>
	                  </div>

	                  {detail.rawLine ? (
	                    <div className={shellStyles.grid}>
	                      <div className={formStyles.label}>{t('logs.detail.rawLine')}</div>
	                      <pre className={shellStyles.codeBlock}>
	                        {renderHighlighted(detail.rawLine, keyword)}
	                      </pre>
	                    </div>
	                  ) : null}
	                </>
	              ) : null}
            </div>
          </aside>
        </>
      ) : null}
    </div>
  );
}
