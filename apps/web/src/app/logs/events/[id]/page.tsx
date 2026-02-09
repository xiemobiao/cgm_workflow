'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ApiClientError, apiFetch } from '@/lib/api';
import { getProjectId } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';

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
  linkCode: string | null;
  requestId: string | null;
  attemptId: string | null;
  deviceMac: string | null;
  deviceSn: string | null;
  errorCode: string | null;
  createdAt: string;
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

type EventContextResponse = {
  logFileId: string;
  before: SearchItem[];
  after: SearchItem[];
};

type CssVars = { [key: `--${string}`]: string | number };
type StyleWithVars = CSSProperties & CssVars;

function hueVars(hue: number): StyleWithVars {
  return { '--hue': hue };
}

function hueForEvent(eventName: string) {
  if (eventName === 'PARSER_ERROR') return 2;
  let hash = 0;
  for (let i = 0; i < eventName.length; i += 1) {
    hash = (hash * 31 + eventName.charCodeAt(i)) >>> 0;
  }
  return hash % 360;
}

function prettyJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function getLevelBadgeClass(level: number): string {
  switch (level) {
    case 1:
      return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30';
    case 2:
      return 'bg-purple-500/20 text-purple-300 border-purple-500/30';
    case 3:
      return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30';
    case 4:
      return 'bg-red-500/20 text-red-300 border-red-500/30';
    default:
      return 'bg-gray-500/20 text-gray-300 border-gray-500/30';
  }
}

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
      <mark key={`${start}-${i}`} className="bg-yellow-500/30 text-yellow-200">
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
  return `${trimmed.slice(0, Math.max(0, maxLen - 1))}...`;
}

export default function EventDetailPage() {
  const { localeTag, t } = useI18n();
  const params = useParams();
  const router = useRouter();
  const eventId = typeof params.id === 'string' ? params.id : '';

  const [detail, setDetail] = useState<LogEventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [context, setContext] = useState<EventContextResponse | null>(null);
  const [contextLoading, setContextLoading] = useState(false);
  const [contextError, setContextError] = useState('');

  const [copyHint, setCopyHint] = useState('');

  // Load event detail
  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;
    const id = window.setTimeout(() => {
      if (cancelled) return;
      setLoading(true);
      setError('');
      setDetail(null);

      apiFetch<LogEventDetail>(`/api/logs/events/${eventId}`)
        .then((data) => {
          if (cancelled) return;
          setDetail(data);
        })
        .catch((e: unknown) => {
          if (cancelled) return;
          const msg = e instanceof ApiClientError ? `${e.code}: ${e.message}` : String(e);
          setError(msg);
        })
        .finally(() => {
          if (cancelled) return;
          setLoading(false);
        });
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [eventId]);

  // Load context
  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;
    const id = window.setTimeout(() => {
      if (cancelled) return;
      setContextLoading(true);
      setContextError('');
      setContext(null);

      apiFetch<EventContextResponse>(`/api/logs/events/${eventId}/context?before=10&after=10`)
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
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [eventId]);

  const copyText = useCallback(async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopyHint(t('common.copied'));
      setTimeout(() => setCopyHint(''), 2000);
    } catch {
      setCopyHint(t('common.copyFailed'));
    }
  }, [t]);

  const handleContextClick = useCallback(
    (id: string) => {
      router.push(`/logs/events/${id}`);
    },
    [router],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">{t('common.loading')}</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 space-y-4">
        <Button variant="outline" size="sm" onClick={() => router.back()}>
          {t('common.back')}
        </Button>
        <div className="text-red-400">{error}</div>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="p-6 space-y-4">
        <Button variant="outline" size="sm" onClick={() => router.back()}>
          {t('common.back')}
        </Button>
        <div className="text-muted-foreground">{t('logs.empty')}</div>
      </div>
    );
  }

  const hue = hueForEvent(detail.eventName);
  const projectId = getProjectId() ?? '';

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="outline" size="sm" onClick={() => router.back()}>
          {t('common.back')}
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/logs/files/${detail.logFileId}/viewer`}>
            {t('logs.files.viewContent')}
          </Link>
        </Button>
        <h1 className="text-xl font-semibold">{t('logs.detail.title')}</h1>
      </div>

      {/* Event Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-4">
            <span
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm border"
              style={{
                borderColor: `hsla(${hue}, 90%, 70%, 0.35)`,
                background: `hsla(${hue}, 90%, 60%, 0.14)`,
                ...hueVars(hue),
              }}
            >
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ background: `hsla(${hue}, 90%, 65%, 0.95)` }}
              />
              {detail.eventName}
            </span>
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs border ${getLevelBadgeClass(detail.level)}`}>
              Level {detail.level}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-muted-foreground text-xs mb-1">{t('logs.time')}</div>
              <div>{new Date(detail.timestampMs).toLocaleString(localeTag)}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs mb-1">{t('logs.thread')}</div>
              <div>
                {detail.threadName || 'main'}
                {detail.threadId !== null && ` (#${detail.threadId})`}
                {detail.isMainThread !== null && (detail.isMainThread ? ' - main' : ' - bg')}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs mb-1">SDK Version</div>
              <div>{detail.sdkVersion || '-'}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs mb-1">App ID</div>
              <div>{detail.appId || '-'}</div>
            </div>
          </div>

          {detail.terminalInfo && (
            <div>
              <div className="text-muted-foreground text-xs mb-1">Terminal Info</div>
              <div className="text-sm">{detail.terminalInfo}</div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Message */}
      {detail.msg && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('logs.message')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm whitespace-pre-wrap break-words">{detail.msg}</div>
          </CardContent>
        </Card>
      )}

	      {/* Message JSON */}
	      {detail.msgJson !== null && (
	        <Card>
	          <CardHeader>
	            <CardTitle className="text-base">{t('logs.detail.msgJson')}</CardTitle>
	          </CardHeader>
          <CardContent>
            <pre className="text-xs bg-black/30 p-4 rounded-lg overflow-auto max-h-96 whitespace-pre-wrap break-words">
              {prettyJson(detail.msgJson)}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* Raw Line */}
      {detail.rawLine && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('logs.detail.rawLine')}</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs bg-black/30 p-4 rounded-lg overflow-auto max-h-48 whitespace-pre-wrap break-all">
              {detail.rawLine}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* IDs and Actions */}
	      <Card>
	        <CardHeader>
	          <CardTitle className="text-base">{t('logs.detail.ids')}</CardTitle>
	        </CardHeader>
	        <CardContent className="space-y-4">
	          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
	            <div>
	              <div className="text-muted-foreground text-xs mb-1">Event ID</div>
	              <div className="font-mono text-xs break-all">{detail.id}</div>
	            </div>
	            <div>
	              <div className="text-muted-foreground text-xs mb-1">Log File ID</div>
	              <div className="font-mono text-xs break-all">{detail.logFileId}</div>
	            </div>
	            <div>
	              <div className="text-muted-foreground text-xs mb-1">Link Code</div>
	              <div className="font-mono text-xs break-all">{detail.linkCode || '-'}</div>
	            </div>
	            <div>
	              <div className="text-muted-foreground text-xs mb-1">Request ID</div>
	              <div className="font-mono text-xs break-all">{detail.requestId || '-'}</div>
	            </div>
	            <div>
	              <div className="text-muted-foreground text-xs mb-1">Attempt ID</div>
	              <div className="font-mono text-xs break-all">{detail.attemptId || '-'}</div>
	            </div>
	            <div>
	              <div className="text-muted-foreground text-xs mb-1">Device MAC</div>
	              <div className="font-mono text-xs break-all">{detail.deviceMac || '-'}</div>
	            </div>
	            <div>
	              <div className="text-muted-foreground text-xs mb-1">Device SN</div>
	              <div className="font-mono text-xs break-all">{detail.deviceSn || '-'}</div>
	            </div>
	            <div>
	              <div className="text-muted-foreground text-xs mb-1">Error Code</div>
	              <div className="font-mono text-xs break-all">{detail.errorCode || '-'}</div>
	            </div>
	          </div>
	          <div className="flex items-center gap-2 flex-wrap">
	            <Button variant="outline" size="sm" onClick={() => void copyText(detail.id)}>
	              {t('logs.detail.copyEventId')}
            </Button>
	            <Button variant="outline" size="sm" onClick={() => void copyText(detail.logFileId)}>
	              {t('logs.detail.copyLogFileId')}
	            </Button>
	            {detail.attemptId && (
	              <Button variant="outline" size="sm" onClick={() => void copyText(detail.attemptId!)}>
	                Copy attemptId
	              </Button>
	            )}
	            {copyHint && <span className="text-green-400 text-sm">{copyHint}</span>}
	          </div>
	          {/* Quick jump */}
	          <div className="flex flex-wrap items-center gap-2">
	            {detail.linkCode && projectId && (
	              <Button asChild variant="outline" size="sm">
	                <Link
	                  href={`/logs/trace?${new URLSearchParams({
	                    projectId,
	                    logFileId: detail.logFileId,
	                    type: 'linkCode',
	                    value: detail.linkCode,
	                    auto: '1',
	                  }).toString()}`}
	                >
	                  Trace linkCode
	                </Link>
	              </Button>
	            )}
	            {detail.requestId && projectId && (
	              <Button asChild variant="outline" size="sm">
	                <Link
	                  href={`/logs/trace?${new URLSearchParams({
	                    projectId,
	                    logFileId: detail.logFileId,
	                    type: 'requestId',
	                    value: detail.requestId,
	                    auto: '1',
	                  }).toString()}`}
	                >
	                  Trace requestId
	                </Link>
	              </Button>
	            )}
	            {detail.attemptId && projectId && (
	              <Button asChild variant="outline" size="sm">
	                <Link
	                  href={`/logs/trace?${new URLSearchParams({
	                    projectId,
	                    logFileId: detail.logFileId,
	                    type: 'attemptId',
	                    value: detail.attemptId,
	                    auto: '1',
	                  }).toString()}`}
	                >
	                  Trace attemptId
	                </Link>
	              </Button>
	            )}
	            {detail.deviceMac && projectId && (
	              <>
	                <Button asChild variant="outline" size="sm">
	                  <Link
	                    href={`/logs/trace?${new URLSearchParams({
	                      projectId,
	                      logFileId: detail.logFileId,
	                      type: 'deviceMac',
	                      value: detail.deviceMac,
	                      startTime: new Date(detail.timestampMs - 2 * 60 * 60 * 1000).toISOString(),
	                      endTime: new Date(detail.timestampMs + 2 * 60 * 60 * 1000).toISOString(),
	                      auto: '1',
	                    }).toString()}`}
	                  >
	                    Trace deviceMac
	                  </Link>
	                </Button>
	                <Button asChild variant="outline" size="sm">
	                  <Link
	                    href={`/logs/commands?${new URLSearchParams({
	                      projectId,
	                      logFileId: detail.logFileId,
	                      deviceMac: detail.deviceMac,
	                      startTime: new Date(detail.timestampMs - 2 * 60 * 60 * 1000).toISOString(),
	                      endTime: new Date(detail.timestampMs + 2 * 60 * 60 * 1000).toISOString(),
	                      limit: '100',
	                      auto: '1',
	                    }).toString()}`}
	                  >
	                    Commands
	                  </Link>
	                </Button>
	              </>
	            )}
	            {detail.deviceSn && projectId && (
	              <Button asChild variant="outline" size="sm">
	                <Link
	                  href={`/logs/trace?${new URLSearchParams({
	                    projectId,
	                    logFileId: detail.logFileId,
	                    type: 'deviceSn',
	                    value: detail.deviceSn,
	                    startTime: new Date(detail.timestampMs - 2 * 60 * 60 * 1000).toISOString(),
	                    endTime: new Date(detail.timestampMs + 2 * 60 * 60 * 1000).toISOString(),
	                    auto: '1',
	                  }).toString()}`}
	                >
	                  Trace deviceSn
	                </Link>
	              </Button>
	            )}
	          </div>
	        </CardContent>
	      </Card>

      {/* Context */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('logs.detail.context')}</CardTitle>
        </CardHeader>
        <CardContent>
          {contextLoading && (
            <div className="text-muted-foreground">{t('common.loading')}</div>
          )}
          {contextError && <div className="text-red-400 text-sm">{contextError}</div>}
          {context && (
            <div className="space-y-2">
              {/* Before events */}
              {context.before.map((item) => {
                const itemHue = hueForEvent(item.eventName);
                return (
                  <div
                    key={item.id}
                    className="flex items-start gap-3 p-2 rounded-lg border border-border/50 hover:bg-accent/30 cursor-pointer transition-colors"
                    onClick={() => handleContextClick(item.id)}
                  >
                    <div className="text-xs text-muted-foreground whitespace-nowrap w-24 flex-shrink-0">
                      {new Date(item.timestampMs).toLocaleTimeString(localeTag)}
                    </div>
                    <div
                      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs border flex-shrink-0"
                      style={{
                        borderColor: `hsla(${itemHue}, 90%, 70%, 0.35)`,
                        background: `hsla(${itemHue}, 90%, 60%, 0.14)`,
                      }}
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ background: `hsla(${itemHue}, 90%, 65%, 0.95)` }}
                      />
                      {item.eventName}
                    </div>
                    <div className="text-xs text-muted-foreground truncate flex-1">
                      {shortenText(item.msg, 80)}
                    </div>
                  </div>
                );
              })}

              {/* Current event indicator */}
              <div className="flex items-center gap-2 py-2">
                <div className="flex-1 h-px bg-primary/50" />
                <span className="text-xs text-primary px-2">{t('logs.detail.current')}</span>
                <div className="flex-1 h-px bg-primary/50" />
              </div>

              {/* After events */}
              {context.after.map((item) => {
                const itemHue = hueForEvent(item.eventName);
                return (
                  <div
                    key={item.id}
                    className="flex items-start gap-3 p-2 rounded-lg border border-border/50 hover:bg-accent/30 cursor-pointer transition-colors"
                    onClick={() => handleContextClick(item.id)}
                  >
                    <div className="text-xs text-muted-foreground whitespace-nowrap w-24 flex-shrink-0">
                      {new Date(item.timestampMs).toLocaleTimeString(localeTag)}
                    </div>
                    <div
                      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs border flex-shrink-0"
                      style={{
                        borderColor: `hsla(${itemHue}, 90%, 70%, 0.35)`,
                        background: `hsla(${itemHue}, 90%, 60%, 0.14)`,
                      }}
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ background: `hsla(${itemHue}, 90%, 65%, 0.95)` }}
                      />
                      {item.eventName}
                    </div>
                    <div className="text-xs text-muted-foreground truncate flex-1">
                      {shortenText(item.msg, 80)}
                    </div>
                  </div>
                );
              })}

              {context.before.length === 0 && context.after.length === 0 && (
                <div className="text-muted-foreground text-sm">
                  {t('logs.detail.contextEmpty')}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
