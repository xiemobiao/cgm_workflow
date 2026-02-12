'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bluetooth,
  RefreshCw,
  Search,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Activity,
  AlertTriangle,
  GitCompare,
  Zap,
  Wifi,
  WifiOff,
  Bug,
} from 'lucide-react';
import { LogDiffViewer } from '@/components/LogDiffViewer';
import { ProjectPicker } from '@/components/ProjectPicker';
import { ApiClientError, apiFetch } from '@/lib/api';
import { getProjectId } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { getActiveLogFileId, setActiveLogFileId } from '@/lib/log-file-scope';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader, PageHeaderActionButton } from '@/components/ui/page-header';
import { fadeIn } from '@/lib/animations';
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

type BluetoothSession = {
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
  sdkVersion: string | null;
  appId: string | null;
};

type SessionsResponse = {
  items: BluetoothSession[];
  hasMore: boolean;
};

type CommandChainStatus = 'success' | 'pending' | 'error' | 'timeout';

type CommandChain = {
  requestId: string;
  startMs: number;
  endMs: number | null;
  durationMs: number | null;
  status: CommandChainStatus;
  eventCount: number;
  events: Array<{
    id: string;
    eventName: string;
    timestampMs: number;
    level: number;
  }>;
};

type ErrorDistribution = {
  errorCode: string;
  count: number;
  percentage: number;
};

type ErrorDistributionResponse = {
  total: number;
  byErrorCode: Array<{
    code: string;
    count: number;
    lastSeen: number;
  }>;
};

type AnomalySummary = {
  totalPatterns: number;
  highSeverityCount: number;
  affectedDevices: number;
};

type AnomalyResponse = {
  patterns: Array<{
    patternType: string;
    description: string;
    severity: number;
    occurrenceCount: number;
    affectedSessions: number;
    sampleEventIds: string[];
    deviceMac: string | null;
    sdkVersion: string | null;
  }>;
  summary: {
    totalEvents: number;
    errorEvents: number;
    disconnectEvents: number;
    timeoutEvents: number;
  };
};

type AnomalyPattern = {
  id: string;
  patternType: string;
  deviceMac: string | null;
  sdkVersion: string | null;
  occurrenceCount: number;
  avgIntervalMs: number | null;
  affectedSessions: number;
  severity: number;
  description: string | null;
};

type CommandAnalysisResponse = {
  chains: CommandChain[];
  stats: {
    total: number;
    success: number;
    timeout: number;
    error: number;
    pending: number;
    avgDurationMs: number | null;
    p50: number | null;
    p90: number | null;
    p99: number | null;
    slowest: Array<{
      requestId: string;
      durationMs: number | null;
      status: CommandChainStatus;
    }>;
  };
};

function formatDatetimeLocal(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toIsoFromDatetimeLocal(value: string) {
  const d = new Date(value);
  return d.toISOString();
}

function formatDuration(ms: number | null): string {
  if (ms === null) return '-';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function getSessionStatusLabel(
  status: SessionStatus,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string {
  return t(`logs.bluetooth.status.${status}`);
}

function getStatusBadge(
  status: SessionStatus,
  t: (key: string, vars?: Record<string, string | number>) => string,
) {
  switch (status) {
    case 'connected':
    case 'communicating':
      return (
        <Badge className="border-emerald-500/30 bg-emerald-500/20 text-emerald-400">
          {getSessionStatusLabel(status, t)}
        </Badge>
      );
    case 'disconnected':
      return <Badge variant="secondary">{getSessionStatusLabel(status, t)}</Badge>;
    case 'error':
      return <Badge variant="destructive">{getSessionStatusLabel(status, t)}</Badge>;
    case 'timeout':
      return (
        <Badge className="border-orange-500/30 bg-orange-500/20 text-orange-400">
          {getSessionStatusLabel(status, t)}
        </Badge>
      );
    case 'scanning':
    case 'pairing':
    case 'connecting':
      return (
        <Badge className="border-blue-500/30 bg-blue-500/20 text-blue-400">
          {getSessionStatusLabel(status, t)}
        </Badge>
      );
    default:
      return <Badge variant="outline">{getSessionStatusLabel(status, t)}</Badge>;
  }
}

function getChainStatusBadge(
  status: CommandChainStatus,
  t: (key: string, vars?: Record<string, string | number>) => string,
) {
  switch (status) {
    case 'success':
      return (
        <Badge className="border-emerald-500/30 bg-emerald-500/20 text-emerald-400">
          {t('logs.commands.status.success')}
        </Badge>
      );
    case 'pending':
      return (
        <Badge className="border-blue-500/30 bg-blue-500/20 text-blue-400">
          {t('logs.commands.status.pending')}
        </Badge>
      );
    case 'timeout':
      return (
        <Badge className="border-orange-500/30 bg-orange-500/20 text-orange-400">
          {t('logs.commands.status.timeout')}
        </Badge>
      );
    case 'error':
      return <Badge variant="destructive">{t('logs.commands.status.error')}</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function getSeverityBadge(
  severity: number,
  t: (key: string, vars?: Record<string, string | number>) => string,
) {
  if (severity >= 4) return <Badge variant="destructive">{t('logs.bluetooth.severityLevel', { level: severity })}</Badge>;
  if (severity >= 3) {
    return <Badge className="border-orange-500/30 bg-orange-500/20 text-orange-400">{t('logs.bluetooth.severityLevel', { level: severity })}</Badge>;
  }
  if (severity >= 2) {
    return <Badge className="border-yellow-500/30 bg-yellow-500/20 text-yellow-400">{t('logs.bluetooth.severityLevel', { level: severity })}</Badge>;
  }
  return <Badge variant="secondary">{t('logs.bluetooth.severityLevel', { level: severity })}</Badge>;
}

function getAnomalyTypeLabel(
  type: string,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string {
  const labels: Record<string, string> = {
    frequent_disconnect: t('logs.bluetooth.anomalyType.frequentDisconnect'),
    timeout_retry: t('logs.bluetooth.anomalyType.timeoutRetry'),
    error_burst: t('logs.bluetooth.anomalyType.errorBurst'),
    slow_connection: t('logs.bluetooth.anomalyType.slowConnection'),
    command_failure: t('logs.bluetooth.anomalyType.commandFailure'),
  };
  return labels[type] ?? type;
}

type TabId = 'sessions' | 'commands' | 'anomalies' | 'errors' | 'compare';

const TABS: { id: TabId; labelKey: string; icon: React.ElementType }[] = [
  { id: 'sessions', labelKey: 'logs.bluetooth.tab.sessions', icon: Wifi },
  { id: 'commands', labelKey: 'logs.bluetooth.tab.commands', icon: Zap },
  { id: 'anomalies', labelKey: 'logs.bluetooth.tab.anomalies', icon: AlertTriangle },
  { id: 'errors', labelKey: 'logs.bluetooth.tab.errors', icon: Bug },
  { id: 'compare', labelKey: 'logs.bluetooth.tab.compare', icon: GitCompare },
];

export default function BluetoothDebugPage() {
  const { localeTag, t } = useI18n();
  const searchParams = useSearchParams();
  const lastProjectIdRef = useRef<string | null>(null);
  const [projectId, setProjectId] = useState('');
  const [activeTab, setActiveTab] = useState<TabId>('sessions');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Time range
  const [startLocal, setStartLocal] = useState('');
  const [endLocal, setEndLocal] = useState('');

  // Filters
  const [logFileId, setLogFileId] = useState('');
  const [deviceMac, setDeviceMac] = useState('');
  const [statusFilter, setStatusFilter] = useState<SessionStatus | ''>('');

  // Sessions data
  const [sessions, setSessions] = useState<BluetoothSession[]>([]);
  const [sessionsTotal, setSessionsTotal] = useState(0);
  const [sessionsHasMore, setSessionsHasMore] = useState(false);

  // Anomalies data
  const [anomalies, setAnomalies] = useState<AnomalyPattern[]>([]);
  const [anomalySummary, setAnomalySummary] = useState<AnomalySummary | null>(null);

  // Error distribution data
  const [errorDistribution, setErrorDistribution] = useState<ErrorDistribution[]>([]);
  const [totalErrors, setTotalErrors] = useState(0);

  // Command chain analysis data
  const [commandChains, setCommandChains] = useState<CommandChain[]>([]);
  const [commandStats, setCommandStats] = useState<CommandAnalysisResponse['stats'] | null>(null);

  // Aggregation state
  const [aggregating, setAggregating] = useState(false);
  const [aggregateResult, setAggregateResult] = useState<string | null>(null);

  useEffect(() => {
    const id = window.setTimeout(() => {
      const qpProjectId = searchParams.get('projectId');
      setProjectId(qpProjectId?.trim() || (getProjectId() ?? ''));

      setLogFileId(searchParams.get('logFileId')?.trim() ?? '');

      const qpStart = searchParams.get('startTime');
      const qpEnd = searchParams.get('endTime');
      const startDate = qpStart ? new Date(qpStart) : null;
      const endDate = qpEnd ? new Date(qpEnd) : null;
      const hasValidRange =
        startDate &&
        endDate &&
        Number.isFinite(startDate.getTime()) &&
        Number.isFinite(endDate.getTime());

      if (hasValidRange) {
        setStartLocal(formatDatetimeLocal(startDate));
        setEndLocal(formatDatetimeLocal(endDate));
      } else {
        const now = new Date();
        setEndLocal(formatDatetimeLocal(now));
        setStartLocal(formatDatetimeLocal(new Date(now.getTime() - 24 * 60 * 60 * 1000)));
      }
    }, 0);
    return () => window.clearTimeout(id);
  }, [searchParams]);

  useEffect(() => {
    if (!projectId) return;
    const previousProjectId = lastProjectIdRef.current;
    if (previousProjectId === projectId) return;
    lastProjectIdRef.current = projectId;

    const stored = getActiveLogFileId(projectId);
    const nextLogFileId = stored ?? '';

    if (previousProjectId && previousProjectId !== projectId) {
      setLogFileId(nextLogFileId);
      return;
    }

    if (!logFileId.trim() && nextLogFileId) {
      setLogFileId(nextLogFileId);
    }
  }, [projectId, logFileId]);

  useEffect(() => {
    if (!projectId) return;
    setActiveLogFileId(projectId, logFileId.trim() || null);
  }, [projectId, logFileId]);

  function setPresetRange(hours: number) {
    const now = new Date();
    setEndLocal(formatDatetimeLocal(now));
    setStartLocal(formatDatetimeLocal(new Date(now.getTime() - hours * 60 * 60 * 1000)));
  }

  async function fetchSessions() {
    if (!projectId || !startLocal || !endLocal) return;
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams({
        projectId,
        startTime: toIsoFromDatetimeLocal(startLocal),
        endTime: toIsoFromDatetimeLocal(endLocal),
      });
      if (logFileId.trim()) qs.set('logFileId', logFileId.trim());
      if (deviceMac.trim()) qs.set('deviceMac', deviceMac.trim());
      if (statusFilter) qs.set('status', statusFilter);
      qs.set('limit', '100');

      const data = await apiFetch<SessionsResponse>(`/api/logs/bluetooth/sessions?${qs.toString()}`);
      const items = Array.isArray(data.items) ? data.items : [];
      setSessions(items);
      setSessionsTotal(items.length);
      setSessionsHasMore(Boolean(data.hasMore));
    } catch (e: unknown) {
      const msg = e instanceof ApiClientError ? `${e.code}: ${e.message}` : String(e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function fetchAnomalies() {
    if (!projectId || !startLocal || !endLocal) return;
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams({
        projectId,
        startTime: toIsoFromDatetimeLocal(startLocal),
        endTime: toIsoFromDatetimeLocal(endLocal),
      });
      if (logFileId.trim()) qs.set('logFileId', logFileId.trim());
      if (deviceMac.trim()) qs.set('deviceMac', deviceMac.trim());

      const data = await apiFetch<AnomalyResponse>(`/api/logs/bluetooth/anomalies?${qs.toString()}`);
      const patterns = Array.isArray(data.patterns) ? data.patterns : [];
      const normalized = patterns.map((p, idx) => ({
        id: `${p.patternType ?? 'unknown'}:${p.deviceMac ?? 'all'}:${idx}`,
        patternType: p.patternType ?? 'unknown',
        deviceMac: p.deviceMac ?? null,
        sdkVersion: p.sdkVersion ?? null,
        occurrenceCount: Number.isFinite(p.occurrenceCount) ? p.occurrenceCount : 0,
        avgIntervalMs: null,
        affectedSessions: Number.isFinite(p.affectedSessions) ? p.affectedSessions : 0,
        severity: Number.isFinite(p.severity) ? p.severity : 0,
        description: p.description ?? null,
      }));
      const affectedDevices = new Set(
        normalized
          .map((p) => p.deviceMac)
          .filter((v): v is string => typeof v === 'string' && v.length > 0),
      ).size;
      setAnomalies(normalized);
      setAnomalySummary({
        totalPatterns: normalized.length,
        highSeverityCount: normalized.filter((p) => p.severity >= 4).length,
        affectedDevices,
      });
    } catch (e: unknown) {
      const msg = e instanceof ApiClientError ? `${e.code}: ${e.message}` : String(e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function fetchErrorDistribution() {
    if (!projectId || !startLocal || !endLocal) return;
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams({
        projectId,
        startTime: toIsoFromDatetimeLocal(startLocal),
        endTime: toIsoFromDatetimeLocal(endLocal),
      });
      if (logFileId.trim()) qs.set('logFileId', logFileId.trim());
      if (deviceMac.trim()) qs.set('deviceMac', deviceMac.trim());

      const data = await apiFetch<ErrorDistributionResponse>(`/api/logs/bluetooth/errors/distribution?${qs.toString()}`);
      const total = Number.isFinite(data.total) ? data.total : 0;
      const byErrorCode = Array.isArray(data.byErrorCode) ? data.byErrorCode : [];
      const distribution = byErrorCode
        .map((e) => ({
          errorCode: e.code ?? 'UNKNOWN',
          count: Number.isFinite(e.count) ? e.count : 0,
          percentage: total > 0 ? ((Number.isFinite(e.count) ? e.count : 0) / total) * 100 : 0,
        }))
        .sort((a, b) => b.count - a.count);

      setErrorDistribution(distribution);
      setTotalErrors(total);
    } catch (e: unknown) {
      const msg = e instanceof ApiClientError ? `${e.code}: ${e.message}` : String(e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function fetchCommandAnalysis() {
    if (!projectId || !startLocal || !endLocal) return;
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams({
        projectId,
        startTime: toIsoFromDatetimeLocal(startLocal),
        endTime: toIsoFromDatetimeLocal(endLocal),
      });
      if (logFileId.trim()) qs.set('logFileId', logFileId.trim());
      if (deviceMac.trim()) qs.set('deviceMac', deviceMac.trim());
      qs.set('limit', '500');

      const data = await apiFetch<CommandAnalysisResponse>(`/api/logs/bluetooth/commands/analysis?${qs.toString()}`);
      setCommandChains(Array.isArray(data.chains) ? data.chains : []);
      setCommandStats(data.stats ?? null);
    } catch (e: unknown) {
      const msg = e instanceof ApiClientError ? `${e.code}: ${e.message}` : String(e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function triggerAggregate() {
    if (!projectId || !startLocal || !endLocal) return;
    setAggregating(true);
    setAggregateResult(null);
    setError('');
    try {
      const data = await apiFetch<{ count: number }>('/api/logs/bluetooth/sessions/aggregate', {
        method: 'POST',
        body: JSON.stringify({
          projectId,
          startTime: toIsoFromDatetimeLocal(startLocal),
          endTime: toIsoFromDatetimeLocal(endLocal),
          forceRefresh: true,
        }),
      });
      setAggregateResult(t('logs.bluetooth.aggregateResult', { count: data.count }));
      await fetchSessions();
    } catch (e: unknown) {
      const msg = e instanceof ApiClientError ? `${e.code}: ${e.message}` : String(e);
      setError(msg);
    } finally {
      setAggregating(false);
    }
  }

  function handleSearch() {
    switch (activeTab) {
      case 'sessions':
        void fetchSessions();
        break;
      case 'commands':
        void fetchCommandAnalysis();
        break;
      case 'anomalies':
        void fetchAnomalies();
        break;
      case 'errors':
        void fetchErrorDistribution();
        break;
    }
  }

  const sessionItems = Array.isArray(sessions) ? sessions : [];
  const commandItems = Array.isArray(commandChains) ? commandChains : [];
  const anomalyItems = Array.isArray(anomalies) ? anomalies : [];
  const errorItems = Array.isArray(errorDistribution) ? errorDistribution : [];

  const sessionsCountLabel = sessionsHasMore ? `${sessionsTotal}+` : `${sessionsTotal}`;
  const commandsCount = commandStats?.total ?? commandItems.length;

  const headerQs = new URLSearchParams();
  if (projectId) headerQs.set('projectId', projectId);
  if (logFileId.trim()) headerQs.set('logFileId', logFileId.trim());
  if (startLocal && endLocal) {
    headerQs.set('startTime', toIsoFromDatetimeLocal(startLocal));
    headerQs.set('endTime', toIsoFromDatetimeLocal(endLocal));
  }
  const headerQuery = headerQs.toString();
  const logsHref = headerQuery ? `/logs?${headerQuery}` : '/logs';
  const traceHref = headerQuery ? `/logs/trace?${headerQuery}` : '/logs/trace';

  return (
    <div className="mx-auto w-full max-w-[1560px] space-y-6 p-6">
      {/* Header */}
      <motion.div
        variants={fadeIn}
        initial="initial"
        animate="animate"
      >
        <PageHeader
          title={t('logs.bluetooth.title')}
          subtitle={loading ? t('common.loading') : t('logs.bluetooth.sessionsCount', { count: sessionsCountLabel })}
          actions={(
            <>
              <PageHeaderActionButton asChild>
                <Link href={logsHref}>{t('logs.title')}</Link>
              </PageHeaderActionButton>
              <PageHeaderActionButton asChild>
                <Link href={traceHref}>{t('logs.trace')}</Link>
              </PageHeaderActionButton>
            </>
          )}
        />
      </motion.div>

      {/* Project Picker & Tabs */}
      <motion.div
        variants={fadeIn}
        initial="initial"
        animate="animate"
        transition={{ delay: 0.1 }}
      >
        <Card className="glass border-white/[0.08]">
          <CardContent className="p-4 space-y-4">
            <ProjectPicker projectId={projectId} onChange={setProjectId} />

            {/* Tabs */}
            <div className="flex flex-wrap gap-1 p-1 bg-muted/30 rounded-lg">
              {TABS.map((tab) => {
                const Icon = tab.icon;
                return (
                  <PageHeaderActionButton
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    variant={activeTab === tab.id ? 'default' : 'outline'}
                    className={cn(activeTab === tab.id ? 'border-primary/40 bg-primary/90 text-primary-foreground hover:bg-primary/80' : '')}
                  >
                    <Icon size={16} />
                    {t(tab.labelKey)}
                  </PageHeaderActionButton>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Filters */}
      <motion.div
        variants={fadeIn}
        initial="initial"
        animate="animate"
        transition={{ delay: 0.15 }}
      >
        <Card className="glass border-white/[0.08]">
          <CardContent className="p-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t('logs.startTime')}</label>
                <Input
                  type="datetime-local"
                  value={startLocal}
                  onChange={(e) => setStartLocal(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t('logs.endTime')}</label>
                <Input
                  type="datetime-local"
                  value={endLocal}
                  onChange={(e) => setEndLocal(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  {t('logs.logFileIdOptional')}
                </label>
                <Input
                  value={logFileId}
                  onChange={(e) => setLogFileId(e.target.value)}
                  placeholder={t('logs.trace.logFileIdPlaceholder')}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t('logs.trace.type.deviceMac')}</label>
                <Input
                  value={deviceMac}
                  onChange={(e) => setDeviceMac(e.target.value)}
                  placeholder={t('logs.trace.type.deviceMacPlaceholder')}
                />
              </div>
              {activeTab === 'sessions' && (
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{t('table.status')}</label>
                  <select
                    className="w-full h-10 rounded-md border border-white/[0.08] bg-background/50 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as SessionStatus | '')}
                  >
                    <option value="">{t('logs.level.all')}</option>
                    <option value="scanning">{t('logs.bluetooth.status.scanning')}</option>
                    <option value="pairing">{t('logs.bluetooth.status.pairing')}</option>
                    <option value="connecting">{t('logs.bluetooth.status.connecting')}</option>
                    <option value="connected">{t('logs.bluetooth.status.connected')}</option>
                    <option value="communicating">{t('logs.bluetooth.status.communicating')}</option>
                    <option value="disconnected">{t('logs.bluetooth.status.disconnected')}</option>
                    <option value="timeout">{t('logs.bluetooth.status.timeout')}</option>
                    <option value="error">{t('logs.bluetooth.status.error')}</option>
                  </select>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <PageHeaderActionButton type="button" disabled={loading} onClick={() => setPresetRange(1)}>
                {t('logs.preset.1h')}
              </PageHeaderActionButton>
              <PageHeaderActionButton type="button" disabled={loading} onClick={() => setPresetRange(24)}>
                {t('logs.preset.24h')}
              </PageHeaderActionButton>
              <PageHeaderActionButton type="button" disabled={loading} onClick={() => setPresetRange(24 * 7)}>
                {t('logs.preset.7d')}
              </PageHeaderActionButton>
              <PageHeaderActionButton
                type="button"
                size="sm"
                disabled={!projectId || loading}
                onClick={handleSearch}
                className="gap-2"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search size={16} />}
                {t('common.search')}
              </PageHeaderActionButton>
              {activeTab === 'sessions' && (
                <PageHeaderActionButton
                  type="button"
                  size="sm"
                  disabled={!projectId || aggregating || Boolean(logFileId.trim())}
                  onClick={() => void triggerAggregate()}
                  className="gap-2"
                >
                  {aggregating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw size={16} />}
                  {t('logs.bluetooth.aggregateSessions')}
                </PageHeaderActionButton>
              )}
            </div>

            {/* Messages */}
            <AnimatePresence>
              {aggregateResult && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm"
                >
                  <CheckCircle2 size={16} />
                  {aggregateResult}
                </motion.div>
              )}
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm"
                >
                  <AlertCircle size={16} />
                  {error}
                </motion.div>
              )}
            </AnimatePresence>
          </CardContent>
        </Card>
      </motion.div>

      {/* Sessions Tab */}
      <AnimatePresence mode="wait">
        {activeTab === 'sessions' && (
          <motion.div
            key="sessions"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            <Card className="glass border-white/[0.08]">
	              <CardHeader className="pb-3">
		                <CardTitle className="text-base flex items-center gap-2">
		                  <Wifi size={18} />
		                  {t('logs.bluetooth.tab.sessions')}
		                  <Badge variant="secondary" className="ml-2">{sessionsCountLabel}</Badge>
		                </CardTitle>
	              </CardHeader>
	              <CardContent className="p-0">
	                {loading && sessionItems.length === 0 ? (
	                  <div className="p-4 space-y-3">
	                    <Skeleton className="h-12 w-full" />
	                    <Skeleton className="h-12 w-full" />
	                    <Skeleton className="h-12 w-full" />
	                  </div>
	                ) : sessionItems.length === 0 ? (
	                  <div className="p-8 text-center">
	                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted/50 flex items-center justify-center">
	                      <WifiOff size={24} className="text-muted-foreground" />
	                    </div>
		                    <p className="text-muted-foreground">
		                      {logFileId.trim()
		                        ? t('logs.bluetooth.emptySessionsWithFile')
		                        : t('logs.bluetooth.emptySessions')}
		                    </p>
	                  </div>
	                ) : (
	                  <div className="overflow-x-auto">
	                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-white/[0.08]">
	                          <th className="text-left p-3 text-muted-foreground font-medium">{t('logs.trace.linkCode')}</th>
	                          <th className="text-left p-3 text-muted-foreground font-medium">{t('logs.trace.type.deviceMac')}</th>
	                          <th className="text-left p-3 text-muted-foreground font-medium">{t('logs.startTime')}</th>
	                          <th className="text-left p-3 text-muted-foreground font-medium">{t('logs.commands.duration')}</th>
	                          <th className="text-left p-3 text-muted-foreground font-medium">{t('table.status')}</th>
	                          <th className="text-right p-3 text-muted-foreground font-medium">{t('common.events')}</th>
	                          <th className="text-right p-3 text-muted-foreground font-medium">{t('logs.fileStatus.errors')}</th>
	                          <th className="text-right p-3 text-muted-foreground font-medium">{t('logs.commands')}</th>
	                          <th className="text-left p-3 text-muted-foreground font-medium">{t('table.sdk')}</th>
                        </tr>
	                      </thead>
	                      <tbody>
	                        {sessionItems.map((session, index) => (
	                          <motion.tr
	                            key={session.id}
	                            initial={{ opacity: 0, y: 10 }}
	                            animate={{ opacity: 1, y: 0 }}
	                            transition={{ delay: index * 0.02 }}
                            className="border-b border-white/[0.06] hover:bg-primary/5 transition-colors"
                          >
                            <td className="p-3">
                              <Link
                                href={`/logs/bluetooth/session/${encodeURIComponent(session.linkCode)}?projectId=${projectId}${logFileId.trim() ? `&logFileId=${encodeURIComponent(logFileId.trim())}` : ''}`}
                                className="text-primary hover:underline font-medium"
                              >
                                {session.linkCode}
                              </Link>
                            </td>
                            <td className="p-3 font-mono text-xs">{session.deviceMac ?? '-'}</td>
                            <td className="p-3 whitespace-nowrap text-muted-foreground">
                              {new Date(session.startTimeMs).toLocaleString(localeTag)}
                            </td>
                            <td className="p-3">{formatDuration(session.durationMs)}</td>
	                            <td className="p-3">{getStatusBadge(session.status, t)}</td>
                            <td className="p-3 text-right">{session.eventCount}</td>
                            <td className="p-3 text-right">
                              <span className={session.errorCount > 0 ? 'text-destructive font-medium' : ''}>
                                {session.errorCount}
                              </span>
                            </td>
                            <td className="p-3 text-right">{session.commandCount}</td>
                            <td className="p-3 text-xs text-muted-foreground">{session.sdkVersion ?? '-'}</td>
                          </motion.tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Commands Tab */}
        {activeTab === 'commands' && (
          <motion.div
            key="commands"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
	            <Card className="glass border-white/[0.08]">
		              <CardHeader className="pb-3">
		                <CardTitle className="text-base flex items-center gap-2">
		                  <Zap size={18} />
		                  {t('logs.bluetooth.commandChains')}
		                  <Badge variant="secondary" className="ml-2">{commandsCount}</Badge>
		                </CardTitle>
	              </CardHeader>
	              <CardContent className="p-0">
	                {loading && commandItems.length === 0 ? (
	                  <div className="p-4 space-y-3">
	                    <Skeleton className="h-12 w-full" />
	                    <Skeleton className="h-12 w-full" />
	                    <Skeleton className="h-12 w-full" />
	                  </div>
	                ) : commandItems.length === 0 ? (
	                  <div className="p-8 text-center">
	                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted/50 flex items-center justify-center">
	                      <Zap size={24} className="text-muted-foreground" />
	                    </div>
		                    <p className="text-muted-foreground">{t('logs.bluetooth.emptyCommandChains')}</p>
	                  </div>
	                ) : (
	                  <div className="overflow-x-auto">
	                    <table className="w-full text-sm">
	                      <thead>
	                        <tr className="border-b border-white/[0.08]">
	                          <th className="text-left p-3 text-muted-foreground font-medium">{t('logs.trace.requestId')}</th>
	                          <th className="text-right p-3 text-muted-foreground font-medium">{t('common.events')}</th>
	                          <th className="text-right p-3 text-muted-foreground font-medium">{t('logs.commands.duration')}</th>
	                          <th className="text-left p-3 text-muted-foreground font-medium">{t('table.status')}</th>
	                          <th className="text-left p-3 text-muted-foreground font-medium">{t('logs.startTime')}</th>
	                        </tr>
	                      </thead>
	                      <tbody>
	                        {commandItems.map((chain, index) => (
	                          <motion.tr
	                            key={chain.requestId}
	                            initial={{ opacity: 0, y: 10 }}
	                            animate={{ opacity: 1, y: 0 }}
	                            transition={{ delay: index * 0.02 }}
	                            className="border-b border-white/[0.06] hover:bg-primary/5 transition-colors"
	                          >
	                            <td className="p-3 font-mono text-xs">{chain.requestId}</td>
	                            <td className="p-3 text-right">{chain.eventCount}</td>
	                            <td className="p-3 text-right">{formatDuration(chain.durationMs)}</td>
	                            <td className="p-3">{getChainStatusBadge(chain.status, t)}</td>
	                            <td className="p-3 whitespace-nowrap text-muted-foreground">
	                              {new Date(chain.startMs).toLocaleString(localeTag)}
	                            </td>
	                          </motion.tr>
	                        ))}
	                      </tbody>
	                    </table>
	                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Anomalies Tab */}
        {activeTab === 'anomalies' && (
          <motion.div
            key="anomalies"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="space-y-4"
          >
            {/* Summary Cards */}
            {anomalySummary && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card className="glass border-white/[0.08]">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                        <Activity className="w-5 h-5 text-blue-400" />
                      </div>
                      <div>
                        <div className="text-2xl font-bold">{anomalySummary.totalPatterns}</div>
                        <div className="text-xs text-muted-foreground">{t('logs.bluetooth.totalPatterns')}</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="glass border-white/[0.08]">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center">
                        <AlertTriangle className="w-5 h-5 text-red-400" />
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-destructive">{anomalySummary.highSeverityCount}</div>
                        <div className="text-xs text-muted-foreground">{t('logs.bluetooth.highSeverity')}</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="glass border-white/[0.08]">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                        <Bluetooth className="w-5 h-5 text-purple-400" />
                      </div>
                      <div>
                        <div className="text-2xl font-bold">{anomalySummary.affectedDevices}</div>
                        <div className="text-xs text-muted-foreground">{t('logs.bluetooth.affectedDevices')}</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            <Card className="glass border-white/[0.08]">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle size={18} />
                  {t('logs.bluetooth.anomalyPatterns')}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {loading && anomalyItems.length === 0 ? (
                  <div className="p-4 space-y-3">
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                  </div>
                ) : anomalyItems.length === 0 ? (
                  <div className="p-8 text-center">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted/50 flex items-center justify-center">
                      <CheckCircle2 size={24} className="text-emerald-400" />
                    </div>
                    <p className="text-muted-foreground">{t('logs.bluetooth.emptyAnomalies')}</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-white/[0.08]">
                          <th className="text-left p-3 text-muted-foreground font-medium">{t('table.title')}</th>
                          <th className="text-left p-3 text-muted-foreground font-medium">{t('logs.bluetooth.severity')}</th>
                          <th className="text-left p-3 text-muted-foreground font-medium">{t('logs.trace.type.deviceMac')}</th>
                          <th className="text-right p-3 text-muted-foreground font-medium">{t('logs.bluetooth.occurrences')}</th>
                          <th className="text-right p-3 text-muted-foreground font-medium">{t('logs.bluetooth.sessions')}</th>
                          <th className="text-right p-3 text-muted-foreground font-medium">{t('logs.bluetooth.avgInterval')}</th>
                          <th className="text-left p-3 text-muted-foreground font-medium">{t('knownIssues.description')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {anomalyItems.map((anomaly, index) => (
                          <motion.tr
                            key={anomaly.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.02 }}
                            className="border-b border-white/[0.06] hover:bg-primary/5 transition-colors"
                          >
                            <td className="p-3 font-medium">{getAnomalyTypeLabel(anomaly.patternType, t)}</td>
                            <td className="p-3">{getSeverityBadge(anomaly.severity, t)}</td>
                            <td className="p-3 font-mono text-xs">{anomaly.deviceMac ?? t('logs.level.all')}</td>
                            <td className="p-3 text-right">{anomaly.occurrenceCount}</td>
                            <td className="p-3 text-right">{anomaly.affectedSessions}</td>
                            <td className="p-3 text-right">{anomaly.avgIntervalMs ? formatDuration(anomaly.avgIntervalMs) : '-'}</td>
                            <td className="p-3 text-muted-foreground">{anomaly.description ?? '-'}</td>
                          </motion.tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Errors Tab */}
        {activeTab === 'errors' && (
          <motion.div
            key="errors"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            <Card className="glass border-white/[0.08]">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Bug size={18} />
                  {t('logs.bluetooth.errorDistribution')}
                  <Badge variant="secondary" className="ml-2">{t('logs.bluetooth.totalWithCount', { count: totalErrors })}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {loading && errorItems.length === 0 ? (
                  <div className="p-4 space-y-3">
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                  </div>
                ) : errorItems.length === 0 ? (
                  <div className="p-8 text-center">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted/50 flex items-center justify-center">
                      <CheckCircle2 size={24} className="text-emerald-400" />
                    </div>
                    <p className="text-muted-foreground">{t('logs.bluetooth.emptyErrors')}</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-white/[0.08]">
                          <th className="text-left p-3 text-muted-foreground font-medium">{t('logs.trace.errorCode')}</th>
                          <th className="text-right p-3 text-muted-foreground font-medium">{t('logs.stats.count')}</th>
                          <th className="text-right p-3 text-muted-foreground font-medium">{t('logs.bluetooth.percentage')}</th>
                          <th className="text-left p-3 text-muted-foreground font-medium" style={{ width: '50%' }}>{t('logs.bluetooth.distribution')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {errorItems.map((err, index) => (
                          <motion.tr
                            key={err.errorCode}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.02 }}
                            className="border-b border-white/[0.06] hover:bg-primary/5 transition-colors"
                          >
                            <td className="p-3 font-mono text-xs">{err.errorCode}</td>
                            <td className="p-3 text-right font-medium">{err.count}</td>
                            <td className="p-3 text-right">{err.percentage.toFixed(1)}%</td>
                            <td className="p-3">
                              <div className="w-full bg-muted/30 rounded-full h-4 overflow-hidden">
                                <motion.div
                                  initial={{ width: 0 }}
                                  animate={{ width: `${Math.max(4, err.percentage)}%` }}
                                  transition={{ duration: 0.5, delay: index * 0.05 }}
                                  className="h-full bg-gradient-to-r from-red-500 to-orange-500 rounded-full"
                                />
                              </div>
                            </td>
                          </motion.tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Compare Tab */}
        {activeTab === 'compare' && (
          <motion.div
            key="compare"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            <Card className="glass border-white/[0.08]">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <GitCompare size={18} />
                  {t('compare.title')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <LogDiffViewer projectId={projectId} />
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
