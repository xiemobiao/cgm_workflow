'use client';

import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Activity, ChevronDown, ChevronRight, ListTree, Route } from 'lucide-react';
import { BluetoothTimeline, type TimelinePhase } from '@/components/BluetoothTimeline';
import { ApiClientError, apiFetch } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageHeader, PageHeaderActionButton } from '@/components/ui/page-header';
import { cn } from '@/lib/utils';

type SessionStatus =
  | 'scanning'
  | 'pairing'
  | 'connecting'
  | 'connected'
  | 'communicating'
  | 'disconnected'
  | 'timeout'
  | 'error';

type CommandChain = {
  requestId: string;
  events: Array<{
    id: string;
    eventName: string;
    timestampMs: number;
    level: number;
    msg: string | null;
  }>;
  startMs: number;
  endMs: number | null;
  durationMs: number | null;
  status: 'success' | 'pending' | 'error' | 'timeout';
  eventCount: number;
};

type SessionDetail = {
  session: {
    id: string;
    linkCode: string;
    deviceMac: string | null;
    startTimeMs: number;
    endTimeMs: number | null;
    durationMs: number | null;
    status: SessionStatus;
    eventCount: number;
    errorCount: number;
    commandCount: number;
    scanStartMs: number | null;
    pairStartMs: number | null;
    connectStartMs: number | null;
    connectedMs: number | null;
    disconnectMs: number | null;
    sdkVersion: string | null;
    appId: string | null;
    terminalInfo: string | null;
  };
  timeline: TimelinePhase[];
  commandChains: CommandChain[];
  events: Array<{
    id: string;
    eventName: string;
    timestampMs: number;
    level: number;
    msg: string | null;
  }>;
};

function formatDuration(ms: number | null): string {
  if (ms === null) return '-';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function getSessionStatusBadge(
  status: SessionStatus,
  t: (key: string, vars?: Record<string, string | number>) => string,
) {
  switch (status) {
    case 'connected':
    case 'communicating':
      return <Badge className="border-emerald-500/30 bg-emerald-500/20 text-emerald-400">{t(`logs.bluetooth.status.${status}`)}</Badge>;
    case 'disconnected':
      return <Badge variant="secondary">{t(`logs.bluetooth.status.${status}`)}</Badge>;
    case 'error':
      return <Badge variant="destructive">{t('logs.bluetooth.status.error')}</Badge>;
    case 'timeout':
      return <Badge className="border-orange-500/30 bg-orange-500/20 text-orange-400">{t('logs.bluetooth.status.timeout')}</Badge>;
    default:
      return <Badge className="border-blue-500/30 bg-blue-500/20 text-blue-400">{t(`logs.bluetooth.status.${status}`)}</Badge>;
  }
}

function getChainStatusBadge(
  status: CommandChain['status'],
  t: (key: string, vars?: Record<string, string | number>) => string,
) {
  switch (status) {
    case 'success':
      return <Badge className="border-emerald-500/30 bg-emerald-500/20 text-emerald-400">{t('logs.commands.status.success')}</Badge>;
    case 'pending':
      return <Badge className="border-blue-500/30 bg-blue-500/20 text-blue-400">{t('logs.commands.status.pending')}</Badge>;
    case 'timeout':
      return <Badge className="border-orange-500/30 bg-orange-500/20 text-orange-400">{t('logs.commands.status.timeout')}</Badge>;
    case 'error':
      return <Badge variant="destructive">{t('logs.commands.status.error')}</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function getLevelBadgeClass(level: number): string {
  switch (level) {
    case 1:
      return 'border-blue-500/30 bg-blue-500/20 text-blue-300';
    case 2:
      return 'border-emerald-500/30 bg-emerald-500/20 text-emerald-300';
    case 3:
      return 'border-amber-500/30 bg-amber-500/20 text-amber-300';
    case 4:
      return 'border-red-500/30 bg-red-500/20 text-red-300';
    default:
      return 'border-white/[0.18] bg-white/[0.08] text-foreground/80';
  }
}

function getLevelLabel(level: number): string {
  switch (level) {
    case 1:
      return 'DEBUG';
    case 2:
      return 'INFO';
    case 3:
      return 'WARN';
    case 4:
      return 'ERROR';
    default:
      return `L${level}`;
  }
}

function truncate(value: string | null, max = 140): string {
  if (!value) return '-';
  if (value.length <= max) return value;
  return `${value.slice(0, max)}...`;
}

type TabId = 'timeline' | 'commands' | 'events';

export default function SessionDetailPage() {
  const { localeTag, t } = useI18n();
  const params = useParams();
  const searchParams = useSearchParams();
  const linkCode = decodeURIComponent(String(params.linkCode ?? ''));
  const projectId = searchParams.get('projectId')?.trim() ?? '';
  const logFileId = searchParams.get('logFileId')?.trim() ?? '';

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('timeline');
  const [expandedCommands, setExpandedCommands] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!projectId || !linkCode) return;

    let cancelled = false;
    const id = window.setTimeout(() => {
      if (cancelled) return;
      setLoading(true);
      setError('');

      const qs = new URLSearchParams({ projectId });
      if (logFileId) qs.set('logFileId', logFileId);

      apiFetch<SessionDetail>(`/api/logs/bluetooth/session/${encodeURIComponent(linkCode)}?${qs.toString()}`)
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
  }, [projectId, linkCode, logFileId]);

  function toggleCommand(requestId: string) {
    setExpandedCommands((prev) => {
      const next = new Set(prev);
      if (next.has(requestId)) next.delete(requestId);
      else next.add(requestId);
      return next;
    });
  }

  const backHref = useMemo(() => (
    `/logs/bluetooth?projectId=${projectId}${logFileId ? `&logFileId=${encodeURIComponent(logFileId)}` : ''}`
  ), [projectId, logFileId]);
  const viewEventsHref = useMemo(() => (
    `/logs?projectId=${projectId}&linkCode=${encodeURIComponent(linkCode)}${logFileId ? `&logFileId=${encodeURIComponent(logFileId)}` : ''}`
  ), [projectId, linkCode, logFileId]);

  return (
    <div className="mx-auto w-full max-w-[1560px] space-y-6 p-6">
      <PageHeader
        title={t('logs.bluetooth.sessionDetail')}
        subtitle={linkCode || '-'}
        actions={(
          <>
            <PageHeaderActionButton asChild>
              <Link href={backHref}>{t('logs.bluetooth.backToSessions')}</Link>
            </PageHeaderActionButton>
            <PageHeaderActionButton asChild>
              <Link href={viewEventsHref}>{t('logs.bluetooth.viewAllEvents')}</Link>
            </PageHeaderActionButton>
          </>
        )}
      />

      {!projectId && (
        <Card className="glass border-white/[0.08]">
          <CardContent className="p-6 text-sm text-red-400">{t('logs.bluetooth.missingProjectId')}</CardContent>
        </Card>
      )}

      {loading && (
        <Card className="glass border-white/[0.08]">
          <CardContent className="p-6 text-sm text-muted-foreground">{t('common.loading')}</CardContent>
        </Card>
      )}

      {error && (
        <Card className="glass border-white/[0.08]">
          <CardContent className="p-6 text-sm text-red-400">{error}</CardContent>
        </Card>
      )}

      {detail && !loading && !error && (
        <>
          <Card className="glass border-white/[0.08]">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Route size={18} />
                {t('logs.bluetooth.sessionOverview')}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4 xl:grid-cols-6">
              <div>
                <div className="mb-1 text-xs text-muted-foreground">{t('table.status')}</div>
                <div>{getSessionStatusBadge(detail.session.status, t)}</div>
              </div>
              <div>
                <div className="mb-1 text-xs text-muted-foreground">{t('logs.trace.type.deviceMac')}</div>
                <div className="font-mono text-xs">{detail.session.deviceMac ?? t('logs.bluetooth.unknown')}</div>
              </div>
              <div>
                <div className="mb-1 text-xs text-muted-foreground">{t('logs.commands.duration')}</div>
                <div>{formatDuration(detail.session.durationMs)}</div>
              </div>
              <div>
                <div className="mb-1 text-xs text-muted-foreground">{t('logs.startTime')}</div>
                <div>{new Date(detail.session.startTimeMs).toLocaleString(localeTag)}</div>
              </div>
              <div>
                <div className="mb-1 text-xs text-muted-foreground">{t('common.events')}</div>
                <div>{detail.session.eventCount}</div>
              </div>
              <div>
                <div className="mb-1 text-xs text-muted-foreground">{t('logs.fileStatus.errors')}</div>
                <div className={detail.session.errorCount > 0 ? 'text-destructive' : ''}>{detail.session.errorCount}</div>
              </div>
              <div>
                <div className="mb-1 text-xs text-muted-foreground">{t('logs.commands')}</div>
                <div>{detail.session.commandCount}</div>
              </div>
              <div>
                <div className="mb-1 text-xs text-muted-foreground">{t('table.sdk')}</div>
                <div>{detail.session.sdkVersion ?? '-'}</div>
              </div>
              <div>
                <div className="mb-1 text-xs text-muted-foreground">{t('logs.eventsDetail.appId')}</div>
                <div>{detail.session.appId ?? '-'}</div>
              </div>
            </CardContent>
          </Card>

          <Card className="glass border-white/[0.08]">
            <CardContent className="flex flex-wrap gap-2 p-4">
              <PageHeaderActionButton
                onClick={() => setActiveTab('timeline')}
                variant={activeTab === 'timeline' ? 'default' : 'outline'}
                className={cn(activeTab === 'timeline' ? 'border-primary/40 bg-primary/90 text-primary-foreground hover:bg-primary/80' : '')}
              >
                {t('logs.bluetooth.tab.timeline')} ({detail.timeline.length})
              </PageHeaderActionButton>
              <PageHeaderActionButton
                onClick={() => setActiveTab('commands')}
                variant={activeTab === 'commands' ? 'default' : 'outline'}
                className={cn(activeTab === 'commands' ? 'border-primary/40 bg-primary/90 text-primary-foreground hover:bg-primary/80' : '')}
              >
                {t('logs.bluetooth.tab.commands')} ({detail.commandChains.length})
              </PageHeaderActionButton>
              <PageHeaderActionButton
                onClick={() => setActiveTab('events')}
                variant={activeTab === 'events' ? 'default' : 'outline'}
                className={cn(activeTab === 'events' ? 'border-primary/40 bg-primary/90 text-primary-foreground hover:bg-primary/80' : '')}
              >
                {t('logs.bluetooth.tab.events')} ({detail.events.length})
              </PageHeaderActionButton>
            </CardContent>
          </Card>

          {activeTab === 'timeline' && (
            <Card className="glass border-white/[0.08]">
              <CardContent className="p-4">
                <BluetoothTimeline
                  phases={detail.timeline}
                  sessionStartMs={detail.session.startTimeMs}
                  sessionEndMs={detail.session.endTimeMs}
                />
              </CardContent>
            </Card>
          )}

          {activeTab === 'commands' && (
            <Card className="glass border-white/[0.08]">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <ListTree size={18} />
                  {t('logs.bluetooth.commandChains')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {detail.commandChains.length === 0 ? (
                  <div className="py-6 text-center text-sm text-muted-foreground">{t('logs.bluetooth.noCommandChainsInSession')}</div>
                ) : (
                  detail.commandChains.map((chain) => (
                    <div key={chain.requestId} className="overflow-hidden rounded-lg border border-white/[0.08] bg-background/40">
                      <button
                        type="button"
                        className="flex w-full items-center gap-3 p-3 text-left hover:bg-white/[0.02]"
                        onClick={() => toggleCommand(chain.requestId)}
                      >
                        {expandedCommands.has(chain.requestId) ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span className="font-mono text-xs text-primary">{chain.requestId}</span>
                        {getChainStatusBadge(chain.status, t)}
                        <span className="text-xs text-muted-foreground">{chain.eventCount} {t('common.events')}</span>
                        <span className="text-xs text-muted-foreground">{formatDuration(chain.durationMs)}</span>
                        <span className="ml-auto text-xs text-muted-foreground">{new Date(chain.startMs).toLocaleTimeString(localeTag)}</span>
                      </button>

                      {expandedCommands.has(chain.requestId) && (
                        <div className="border-t border-white/[0.08] p-3">
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b border-white/[0.08] text-xs text-muted-foreground">
                                  <th className="p-2 text-left">{t('logs.time')}</th>
                                  <th className="p-2 text-left">{t('table.event')}</th>
                                  <th className="p-2 text-left">{t('table.level')}</th>
                                  <th className="p-2 text-left">{t('logs.message')}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {chain.events.map((event) => (
                                  <tr key={event.id} className="border-b border-white/[0.06]">
                                    <td className="p-2 whitespace-nowrap text-xs text-muted-foreground">
                                      {new Date(event.timestampMs).toLocaleTimeString(localeTag)}
                                    </td>
                                    <td className="p-2">{event.eventName}</td>
                                    <td className="p-2">
                                      <span className={cn('inline-flex rounded border px-1.5 py-0.5 text-[10px] font-semibold', getLevelBadgeClass(event.level))}>
                                        {getLevelLabel(event.level)}
                                      </span>
                                    </td>
                                    <td className="p-2 text-xs text-muted-foreground">{truncate(event.msg, 100)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          )}

          {activeTab === 'events' && (
            <Card className="glass border-white/[0.08]">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Activity size={18} />
                  {t('logs.bluetooth.tab.events')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/[0.08] text-xs text-muted-foreground">
                        <th className="p-2 text-left">{t('logs.time')}</th>
                        <th className="p-2 text-left">{t('table.event')}</th>
                        <th className="p-2 text-left">{t('table.level')}</th>
                        <th className="p-2 text-left">{t('logs.message')}</th>
                        <th className="p-2 text-left">{t('table.id')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.events.map((event) => (
                        <tr key={event.id} className="border-b border-white/[0.06]">
                          <td className="p-2 whitespace-nowrap text-xs text-muted-foreground">
                            {new Date(event.timestampMs).toLocaleString(localeTag)}
                          </td>
                          <td className="p-2">{event.eventName}</td>
                          <td className="p-2">
                            <span className={cn('inline-flex rounded border px-1.5 py-0.5 text-[10px] font-semibold', getLevelBadgeClass(event.level))}>
                              {getLevelLabel(event.level)}
                            </span>
                          </td>
                          <td className="p-2 text-xs text-muted-foreground">{truncate(event.msg, 150)}</td>
                          <td className="p-2 text-xs">
                            <Link
                              href={`/logs?projectId=${projectId}&eventId=${event.id}`}
                              className="text-primary hover:underline"
                            >
                              {event.id.slice(0, 8)}...
                            </Link>
                          </td>
                        </tr>
                      ))}
                      {detail.events.length === 0 && (
                        <tr>
                          <td colSpan={5} className="p-6 text-center text-sm text-muted-foreground">
                            {t('common.noData')}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
