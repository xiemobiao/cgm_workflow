'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import shellStyles from '@/components/AppShell.module.css';
import formStyles from '@/components/Form.module.css';
import { ApiClientError, apiFetch } from '@/lib/api';
import { getProjectId } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';

type LogFileDetail = {
  id: string;
  projectId: string;
  fileName: string;
  status: 'queued' | 'parsed' | 'failed';
  parserVersion: string | null;
  uploadedAt: string;
  eventCount: number;
  errorCount: number;
  minTimestampMs: number | null;
  maxTimestampMs: number | null;
};

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

type EventContextResponse = {
  logFileId: string;
  before: SearchItem[];
  after: SearchItem[];
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

function shortenText(value: string | null, maxLen: number) {
  if (!value) return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, Math.max(0, maxLen - 1))}…`;
}

function prettyJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export default function LogFileViewerPage() {
  const { localeTag, t } = useI18n();
  const params = useParams();
  const fileId = typeof params.id === 'string' ? params.id : '';

  const [fileDetail, setFileDetail] = useState<LogFileDetail | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState('');

  const [eventName, setEventName] = useState('');
  const [keyword, setKeyword] = useState('');
  const [level, setLevel] = useState<string>('');
  const [limit, setLimit] = useState(100);

  const [cursor, setCursor] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [items, setItems] = useState<SearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [detail, setDetail] = useState<LogEventDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [context, setContext] = useState<EventContextResponse | null>(null);
  const [contextLoading, setContextLoading] = useState(false);
  const [contextError, setContextError] = useState('');
  const [copyHint, setCopyHint] = useState('');

  useEffect(() => {
    const saved = localStorage.getItem('cgm_log_file_viewer_limit');
    const n = saved ? Number(saved) : NaN;
    if (Number.isFinite(n) && n >= 1 && n <= 200) {
      setLimit(Math.trunc(n));
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('cgm_log_file_viewer_limit', String(limit));
  }, [limit]);

  useEffect(() => {
    if (!fileId) return;
    let cancelled = false;
    setFileLoading(true);
    setFileError('');
    setFileDetail(null);
    apiFetch<LogFileDetail>(`/api/logs/files/${fileId}`)
      .then((data) => {
        if (cancelled) return;
        setFileDetail(data);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const msg = e instanceof ApiClientError ? `${e.code}: ${e.message}` : String(e);
        setFileError(msg);
      })
      .finally(() => {
        if (cancelled) return;
        setFileLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fileId]);

  const timeRange = useMemo(() => {
    const now = Date.now();
    const startMs = fileDetail?.minTimestampMs ?? now - 24 * 60 * 60 * 1000;
    const endMs = fileDetail?.maxTimestampMs ?? now;
    const safeStart = Number.isFinite(startMs) ? startMs : now - 24 * 60 * 60 * 1000;
    const safeEnd = Number.isFinite(endMs) ? endMs : now;
    const fixedEnd = safeEnd <= safeStart ? safeStart + 1 : safeEnd;
    return {
      startMs: safeStart,
      endMs: fixedEnd,
      startTime: new Date(safeStart).toISOString(),
      endTime: new Date(fixedEnd).toISOString(),
    };
  }, [fileDetail?.maxTimestampMs, fileDetail?.minTimestampMs]);

  async function search(resetCursor: boolean) {
    if (!fileId) return;
    setLoading(true);
    setError('');
    try {
      const projectId = fileDetail?.projectId || getProjectId() || '';
      if (!projectId) {
        setError('Missing projectId');
        return;
      }

      const qs = new URLSearchParams({
        projectId,
        logFileId: fileId,
        startTime: timeRange.startTime,
        endTime: timeRange.endTime,
        limit: String(limit),
      });
      if (eventName.trim()) qs.set('eventName', eventName.trim());
      if (keyword.trim()) qs.set('q', keyword.trim());
      if (level) qs.set('level', level);
      if (!resetCursor && cursor) qs.set('cursor', cursor);

      const data = await apiFetch<SearchResponse>(`/api/logs/events/search?${qs.toString()}`);
      if (resetCursor) {
        setCursor(null);
        setNextCursor(null);
        setItems(data.items);
      } else {
        setItems((prev) => [...prev, ...data.items]);
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

  useEffect(() => {
    if (!fileDetail) return;
    void search(true);
  }, [fileDetail?.id]);

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
        const msg = e instanceof ApiClientError ? `${e.code}: ${e.message}` : String(e);
        setDetailError(msg);
      })
      .finally(() => {
        if (cancelled) return;
        setDetailLoading(false);
      });

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

  async function copyText(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopyHint(t('common.copied'));
    } catch {
      setCopyHint(t('common.copyFailed'));
    }
  }

  return (
    <div className={shellStyles.grid}>
      <div className={shellStyles.card}>
        <div className={formStyles.row} style={{ justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: 20, marginBottom: 2 }}>{t('logs.files.viewerTitle')}</h1>
            <div className={formStyles.muted}>
              {fileDetail ? fileDetail.fileName : fileId}
            </div>
          </div>
          <div className={formStyles.row}>
            <Link href={`/logs/files/${fileId}`} className={shellStyles.button}>
              {t('common.back')}
            </Link>
            <Link href="/logs/files" className={shellStyles.button}>
              {t('logs.files.title')}
            </Link>
          </div>
        </div>

        {fileLoading ? <div className={formStyles.muted}>{t('common.loading')}</div> : null}
        {fileError ? <div className={formStyles.error}>{fileError}</div> : null}

        {fileDetail ? (
          <div className={shellStyles.kvGrid} style={{ marginTop: 12 }}>
            <div className={shellStyles.kvKey}>{t('logs.files.status')}</div>
            <div className={shellStyles.kvValue}>
              <span
                className={`${shellStyles.badge}${fileDetail.status === 'failed' ? ` ${shellStyles.badgeDanger}` : ''}`}
              >
                {t(`logs.fileStatus.${fileDetail.status}`)}
              </span>
            </div>

            <div className={shellStyles.kvKey}>{t('logs.files.uploadedAt')}</div>
            <div className={shellStyles.kvValue}>
              {new Date(fileDetail.uploadedAt).toLocaleString(localeTag)}
            </div>

            <div className={shellStyles.kvKey}>{t('logs.files.events')}</div>
            <div className={shellStyles.kvValue}>{fileDetail.eventCount}</div>

            <div className={shellStyles.kvKey}>{t('logs.files.errors')}</div>
            <div className={shellStyles.kvValue}>{fileDetail.errorCount}</div>

            <div className={shellStyles.kvKey}>{t('logs.files.timeRange')}</div>
            <div className={shellStyles.kvValue}>
              {fileDetail.minTimestampMs !== null && fileDetail.maxTimestampMs !== null
                ? `${new Date(timeRange.startMs).toLocaleString(localeTag)} ~ ${new Date(timeRange.endMs).toLocaleString(localeTag)}`
                : t('logs.files.timeRangeUnknown')}
            </div>
          </div>
        ) : null}
      </div>

      <div className={shellStyles.card}>
        <div className={formStyles.row}>
          <div className={formStyles.field} style={{ minWidth: 220 }}>
            <div className={formStyles.label}>{t('logs.eventNameOptional')}</div>
            <input
              className={formStyles.input}
              value={eventName}
              onChange={(e) => setEventName(e.target.value)}
              placeholder="e.g. sdk_auth_start"
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
          <div className={formStyles.field} style={{ minWidth: 140 }}>
            <div className={formStyles.label}>{t('logs.level')}</div>
            <select className={formStyles.select} value={level} onChange={(e) => setLevel(e.target.value)}>
              <option value="">{t('logs.level.all')}</option>
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="4">4</option>
            </select>
          </div>
          <div className={formStyles.field} style={{ minWidth: 140 }}>
            <div className={formStyles.label}>{t('logs.limit')}</div>
            <input
              className={formStyles.input}
              type="number"
              min={1}
              max={200}
              value={limit}
              onChange={(e) => {
                const n = e.currentTarget.valueAsNumber;
                if (!Number.isFinite(n)) return;
                setLimit(Math.min(Math.max(Math.trunc(n), 1), 200));
              }}
            />
          </div>
          <button
            className={shellStyles.button}
            type="button"
            disabled={loading}
            onClick={() => {
              setEventName('PARSER_ERROR');
              window.setTimeout(() => void search(true), 0);
            }}
          >
            {t('logs.onlyParserError')}
          </button>
          <button className={shellStyles.button} type="button" disabled={loading} onClick={() => void search(true)}>
            {t('common.search')}
          </button>
          <button
            className={shellStyles.button}
            type="button"
            disabled={loading || !nextCursor}
            onClick={() => void search(false)}
          >
            {t('common.loadMore')}
          </button>
          <div className={formStyles.muted}>
            {loading ? t('common.loading') : t('common.items', { count: items.length })}
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
              {items.map((e) => (
                <tr
                  key={e.id}
                  className={shellStyles.clickableRow}
                  onClick={() => setSelectedEventId(e.id)}
                >
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {new Date(e.timestampMs).toLocaleString(localeTag)}
                  </td>
                  <td style={{ minWidth: 360 }}>
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
                        {renderHighlighted(shortenText(e.msg, 160), keyword)}
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
              {items.length === 0 ? (
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
          <div className={shellStyles.drawerOverlay} onClick={() => setSelectedEventId(null)} />
          <aside className={shellStyles.drawer} role="dialog" aria-modal="true">
            <div className={shellStyles.drawerHeader}>
              <div>
                <div className={shellStyles.drawerTitle}>{t('logs.detail.title')}</div>
                <div className={formStyles.muted}>{detail ? detail.eventName : selectedEventId}</div>
              </div>
              <button className={shellStyles.button} type="button" onClick={() => setSelectedEventId(null)}>
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
                      {detail.threadName ?? '-'}
                      {detail.threadId !== null ? ` (#${detail.threadId})` : ''}
                      {detail.isMainThread === null ? '' : detail.isMainThread ? ' · main' : ' · bg'}
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
                    <button
                      className={shellStyles.button}
                      type="button"
                      onClick={() => void copyText(detail.logFileId)}
                    >
                      {t('logs.detail.copyLogFileId')}
                    </button>
                    {copyHint ? <div className={formStyles.success}>{copyHint}</div> : null}
                  </div>

                  <div className={shellStyles.grid}>
                    <div className={formStyles.label}>{t('logs.detail.context')}</div>
                    {contextLoading ? <div className={formStyles.muted}>{t('common.loading')}</div> : null}
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

