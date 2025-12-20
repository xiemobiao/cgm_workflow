'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import shellStyles from '@/components/AppShell.module.css';
import formStyles from '@/components/Form.module.css';
import { ApiClientError, apiFetch } from '@/lib/api';
import { getProjectId } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import viewerStyles from './LogViewer.module.css';

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

function hueForEvent(eventName: string) {
  if (eventName === 'PARSER_ERROR') return 2;
  let hash = 0;
  for (let i = 0; i < eventName.length; i += 1) {
    hash = (hash * 31 + eventName.charCodeAt(i)) >>> 0;
  }
  return hash % 360;
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
    if (Number.isFinite(n) && n >= 1 && n <= 1000) {
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
    const uploadedAtMs = fileDetail?.uploadedAt
      ? new Date(fileDetail.uploadedAt).getTime()
      : now;
    const fallbackStart = uploadedAtMs - 60 * 1000;
    const startMs = fileDetail?.minTimestampMs ?? fallbackStart;
    const endMs = fileDetail?.maxTimestampMs ?? now;
    const safeStart = Number.isFinite(startMs) ? startMs : fallbackStart;
    const safeEnd = Number.isFinite(endMs) ? endMs : now;
    const fixedEnd = safeEnd <= safeStart ? safeStart + 1 : safeEnd;
    return {
      startMs: safeStart,
      endMs: fixedEnd,
      startTime: new Date(safeStart).toISOString(),
      endTime: new Date(fixedEnd).toISOString(),
    };
  }, [fileDetail?.maxTimestampMs, fileDetail?.minTimestampMs, fileDetail?.uploadedAt]);

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
      qs.set('direction', 'asc');
      if (level) qs.set('level', level);
      if (!resetCursor && cursor) qs.set('cursor', cursor);

      const data = await apiFetch<SearchResponse>(`/api/logs/events/search?${qs.toString()}`);
      if (resetCursor) {
        setCursor(null);
        setNextCursor(null);
        setItems(data.items);
      } else {
        setItems((prev) => {
          const seen = new Set(prev.map((i) => i.id));
          const appended = data.items.filter((i) => !seen.has(i.id));
          return [...prev, ...appended];
        });
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

  const legend = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) {
      counts.set(item.eventName, (counts.get(item.eventName) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count, hue: hueForEvent(name) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 24);
  }, [items]);

  const logsHref = useMemo(() => {
    if (!fileId) return '/logs';
    const qs = new URLSearchParams({
      logFileId: fileId,
      startMs: String(timeRange.startMs),
      endMs: String(timeRange.endMs),
    });
    return `/logs?${qs.toString()}`;
  }, [fileId, timeRange.endMs, timeRange.startMs]);

  const listSentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = listSentinelRef.current;
    if (!el) return;
    if (!nextCursor) return;
    if (loading) return;

    const obs = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        if (!nextCursor) return;
        if (loading) return;
        void search(false);
      },
      { root: null, rootMargin: '180px', threshold: 0.01 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [nextCursor, loading]);

  return (
    <div className={shellStyles.grid}>
      <div className={viewerStyles.layout}>
        <aside className={`${shellStyles.card} ${viewerStyles.panel}`}>
          <div className={viewerStyles.header}>
            <div className={viewerStyles.title}>
              <h1>{t('logs.files.viewerTitle')}</h1>
              <div className={viewerStyles.subtitle}>{fileDetail ? fileDetail.fileName : fileId}</div>
            </div>
            <div className={formStyles.row}>
              <Link href={`/logs/files/${fileId}`} className={shellStyles.button}>
                {t('common.back')}
              </Link>
            </div>
          </div>

          <div className={formStyles.row}>
            <Link href="/logs/files" className={shellStyles.button}>
              {t('logs.files.title')}
            </Link>
            <Link href={logsHref} className={shellStyles.button}>
              {t('logs.files.openInLogs')}
            </Link>
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

          <div className={viewerStyles.divider} />

          <div className={viewerStyles.toolbar}>
            <div className={formStyles.field}>
              <div className={formStyles.label}>{t('logs.eventNameOptional')}</div>
              <input
                className={formStyles.input}
                value={eventName}
                onChange={(e) => setEventName(e.target.value)}
                placeholder="e.g. sdk_auth_start"
              />
            </div>
            <div className={formStyles.field}>
              <div className={formStyles.label}>{t('logs.keyword')}</div>
              <input
                className={formStyles.input}
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="e.g. error / timeout"
              />
            </div>
            <div className={formStyles.row}>
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
                    setLimit(Math.min(Math.max(Math.trunc(n), 1), 1000));
                  }}
                />
              </div>
            </div>

            <div className={formStyles.row}>
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
              <button
                className={shellStyles.button}
                type="button"
                disabled={loading}
                onClick={() => void search(true)}
              >
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
                {loading
                  ? t('common.loading')
                  : fileDetail
                    ? t('logs.files.viewerLoaded', {
                        loaded: items.length,
                        total: fileDetail.eventCount,
                      })
                    : t('common.items', { count: items.length })}
              </div>
            </div>

            {error ? <div className={formStyles.error}>{error}</div> : null}
          </div>

          {legend.length ? (
            <>
              <div className={viewerStyles.divider} />
              <div className={viewerStyles.legend}>
                <div className={viewerStyles.legendTitle}>{t('logs.files.viewerLegend')}</div>
                <div className={viewerStyles.chips}>
                  {legend.map((it) => (
                    <div
                      key={it.name}
                      className={`${viewerStyles.chip}${eventName === it.name ? ` ${viewerStyles.chipActive}` : ''}`}
                      style={{ ['--hue' as any]: it.hue }}
                      onClick={() => {
                        setEventName((prev) => (prev === it.name ? '' : it.name));
                        window.setTimeout(() => void search(true), 0);
                      }}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          setEventName((prev) => (prev === it.name ? '' : it.name));
                          window.setTimeout(() => void search(true), 0);
                        }
                      }}
                    >
                      <span className={viewerStyles.chipDot} />
                      <span className={viewerStyles.chipText}>{it.name}</span>
                      <span className={viewerStyles.chipCount}>{it.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : null}
        </aside>

        <section className={`${shellStyles.card} ${viewerStyles.stream}`}>
          <div className={viewerStyles.streamHeader}>
            <div className={viewerStyles.streamTitle}>{t('logs.files.viewerStream')}</div>
            <div className={formStyles.muted}>
              {fileDetail ? fileDetail.fileName : fileId}
            </div>
          </div>

          <div className={viewerStyles.list}>
            {items.map((e) => {
              const hue = hueForEvent(e.eventName);
              const active = selectedEventId === e.id;
              const levelClass =
                e.level === 1
                  ? viewerStyles.level1
                  : e.level === 2
                    ? viewerStyles.level2
                    : e.level === 3
                      ? viewerStyles.level3
                      : viewerStyles.level4;

              return (
                <div key={e.id} className={viewerStyles.line} style={{ ['--hue' as any]: hue }}>
                  <div
                    className={viewerStyles.lineHeader}
                    onClick={() => setSelectedEventId((prev) => (prev === e.id ? null : e.id))}
                  >
                    <div className={viewerStyles.gutter}>
                      <div className={viewerStyles.time}>
                        {new Date(e.timestampMs).toLocaleString(localeTag)}
                      </div>
                      <div className={viewerStyles.meta}>
                        <span className={`${viewerStyles.levelDot} ${levelClass}`} />
                        <span>Lv {e.level}</span>
                        {e.sdkVersion ? <span>{e.sdkVersion}</span> : null}
                        {e.appId ? <span>{e.appId}</span> : null}
                      </div>
                    </div>

                    <div className={viewerStyles.main}>
                      <div className={viewerStyles.eventRow}>
                        <span className={viewerStyles.eventBadge} style={{ ['--hue' as any]: hue }}>
                          <span className={viewerStyles.eventBadgeDot} />
                          {renderHighlighted(e.eventName, keyword)}
                        </span>
                      </div>
                      <div className={viewerStyles.message}>
                        {e.msg ? renderHighlighted(shortenText(e.msg, 220), keyword) : ''}
                      </div>
                    </div>

                    <div className={viewerStyles.right}>
                      <div className={viewerStyles.id}>{e.id.slice(0, 8)}…</div>
                      <div className={viewerStyles.expandHint}>
                        {active ? t('logs.files.viewerCollapse') : t('logs.files.viewerExpand')}
                      </div>
                    </div>
                  </div>

                  {active ? (
                    <div className={viewerStyles.expanded}>
                      {detailLoading ? <div className={formStyles.muted}>{t('common.loading')}</div> : null}
                      {detailError ? <div className={formStyles.error}>{detailError}</div> : null}

                      {detail && detail.id === e.id ? (
                        <>
                          <div className={viewerStyles.expandedGrid}>
                            <div>
                              <div className={viewerStyles.fieldTitle}>msg</div>
                              <div className={viewerStyles.fieldText}>
                                {detail.msg ? renderHighlighted(detail.msg, keyword) : '-'}
                              </div>
                            </div>
                            <div>
                              <div className={viewerStyles.fieldTitle}>terminalInfo</div>
                              <div className={viewerStyles.fieldText}>{detail.terminalInfo ?? '-'}</div>
                            </div>
                            <div>
                              <div className={viewerStyles.fieldTitle}>thread</div>
                              <div className={viewerStyles.fieldText}>
                                {detail.threadName ?? '-'}
                                {detail.threadId !== null ? ` (#${detail.threadId})` : ''}
                                {detail.isMainThread === null ? '' : detail.isMainThread ? ' · main' : ' · bg'}
                              </div>
                            </div>
                            <div>
                              <div className={viewerStyles.fieldTitle}>ids</div>
                              <div className={viewerStyles.fieldText}>
                                eventId: {detail.id}
                                {'\n'}
                                logFileId: {detail.logFileId}
                              </div>
                            </div>

                            <div className={viewerStyles.expandedGridFull}>
                              <div className={viewerStyles.fieldTitle}>{t('logs.detail.msgJson')}</div>
                              <pre className={shellStyles.codeBlock}>
                                {renderHighlighted(prettyJson(detail.msgJson), keyword)}
                              </pre>
                            </div>

                            {detail.rawLine ? (
                              <div className={viewerStyles.expandedGridFull}>
                                <div className={viewerStyles.fieldTitle}>{t('logs.detail.rawLine')}</div>
                                <pre className={shellStyles.codeBlock}>
                                  {renderHighlighted(detail.rawLine, keyword)}
                                </pre>
                              </div>
                            ) : null}
                          </div>

                          <div className={formStyles.row}>
                            <button
                              className={shellStyles.button}
                              type="button"
                              onClick={() => void copyText(detail.id)}
                            >
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

                          <div className={viewerStyles.contextStrip}>
                            <div className={viewerStyles.fieldTitle}>{t('logs.detail.context')}</div>
                            {contextLoading ? (
                              <div className={formStyles.muted}>{t('common.loading')}</div>
                            ) : null}
                            {contextError ? <div className={formStyles.error}>{contextError}</div> : null}
                            {context ? (
                              <>
                                {context.before.map((c) => (
                                  <div
                                    key={c.id}
                                    className={viewerStyles.contextRow}
                                    onClick={() => {
                                      setItems((prev) => {
                                        if (prev.some((p) => p.id === c.id)) return prev;
                                        const next = [...prev, c];
                                        next.sort(
                                          (a, b) =>
                                            a.timestampMs - b.timestampMs || a.id.localeCompare(b.id),
                                        );
                                        return next;
                                      });
                                      setSelectedEventId(c.id);
                                    }}
                                  >
                                    <div className={viewerStyles.contextTime}>
                                      {new Date(c.timestampMs).toLocaleString(localeTag)}
                                    </div>
                                    <div className={viewerStyles.contextEvent}>
                                      <div>{renderHighlighted(c.eventName, keyword)}</div>
                                      {c.msg ? (
                                        <div className={formStyles.muted} style={{ marginTop: 4 }}>
                                          {renderHighlighted(shortenText(c.msg, 180), keyword)}
                                        </div>
                                      ) : null}
                                    </div>
                                  </div>
                                ))}

                                <div className={formStyles.muted}>{t('logs.detail.current')}</div>

                                {context.after.map((c) => (
                                  <div
                                    key={c.id}
                                    className={viewerStyles.contextRow}
                                    onClick={() => {
                                      setItems((prev) => {
                                        if (prev.some((p) => p.id === c.id)) return prev;
                                        const next = [...prev, c];
                                        next.sort(
                                          (a, b) =>
                                            a.timestampMs - b.timestampMs || a.id.localeCompare(b.id),
                                        );
                                        return next;
                                      });
                                      setSelectedEventId(c.id);
                                    }}
                                  >
                                    <div className={viewerStyles.contextTime}>
                                      {new Date(c.timestampMs).toLocaleString(localeTag)}
                                    </div>
                                    <div className={viewerStyles.contextEvent}>
                                      <div>{renderHighlighted(c.eventName, keyword)}</div>
                                      {c.msg ? (
                                        <div className={formStyles.muted} style={{ marginTop: 4 }}>
                                          {renderHighlighted(shortenText(c.msg, 180), keyword)}
                                        </div>
                                      ) : null}
                                    </div>
                                  </div>
                                ))}

                                {context.before.length === 0 && context.after.length === 0 ? (
                                  <div className={formStyles.muted}>{t('logs.detail.contextEmpty')}</div>
                                ) : null}
                              </>
                            ) : null}
                          </div>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}

            {items.length === 0 ? <div className={formStyles.muted}>{t('logs.empty')}</div> : null}
            <div ref={listSentinelRef} />
          </div>
        </section>
      </div>
    </div>
  );
}
