'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Zap,
  Search,
  Loader2,
  AlertCircle,
  Timer,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  ArrowLeft,
  Activity,
  GitBranch,
  FileText,
} from 'lucide-react';
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
import { fadeIn, staggerContainer, staggerItem } from '@/lib/animations';
import { cn } from '@/lib/utils';

type CommandEvent = {
  id: string;
  eventName: string;
  level: number;
  timestampMs: number;
  errorCode: string | null;
  msg: string | null;
};

type CommandChain = {
  requestId: string;
  deviceMac: string | null;
  eventCount: number;
  startTime: number;
  endTime: number;
  duration: number;
  status: 'success' | 'timeout' | 'error' | 'pending';
  events: CommandEvent[];
};

type CommandChainsResponse = {
  count: number;
  items: CommandChain[];
};

function formatDatetimeLocal(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toIsoFromDatetimeLocal(value: string) {
  return new Date(value).toISOString();
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function getStatusBadge(status: string, t: (key: string) => string) {
  switch (status) {
    case 'success':
      return (
        <Badge className="border-emerald-500/30 bg-emerald-500/20 text-emerald-400">
          {t('logs.commands.status.success')}
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
    case 'pending':
      return <Badge variant="secondary">{t('logs.commands.status.pending')}</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function getLevelColor(level: number): string {
  if (level >= 4) return 'bg-red-500';
  if (level >= 3) return 'bg-orange-500';
  if (level >= 2) return 'bg-blue-500';
  return 'bg-emerald-500';
}

export default function CommandsPage() {
  const { localeTag, t } = useI18n();
  const searchParams = useSearchParams();
  const lastProjectIdRef = useRef<string | null>(null);
  const [projectId, setProjectId] = useState('');
  const [logFileId, setLogFileId] = useState('');
  const [deviceMac, setDeviceMac] = useState('');
  const [startLocal, setStartLocal] = useState('');
  const [endLocal, setEndLocal] = useState('');
  const [limit, setLimit] = useState(100);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [chains, setChains] = useState<CommandChain[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [autoSearch, setAutoSearch] = useState(false);
  const [autoSearchDone, setAutoSearchDone] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => {
      const qpProjectId = searchParams.get('projectId');
      setProjectId(qpProjectId?.trim() || (getProjectId() ?? ''));

      setLogFileId(searchParams.get('logFileId')?.trim() ?? '');

      const qpDeviceMac = searchParams.get('deviceMac');
      if (qpDeviceMac?.trim()) {
        setDeviceMac(qpDeviceMac.trim());
      }

      const qpLimit = searchParams.get('limit');
      if (qpLimit) {
        const n = Number(qpLimit);
        if (Number.isFinite(n)) {
          setLimit(Math.min(Math.max(Math.trunc(n), 1), 500));
        }
      }

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

      const qpAuto = searchParams.get('auto');
      setAutoSearch(qpAuto === '1' || qpAuto === 'true');
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

  const canSearch = useMemo(() => Boolean(projectId && startLocal && endLocal), [projectId, startLocal, endLocal]);

  function setPresetRange(hours: number) {
    const now = new Date();
    setEndLocal(formatDatetimeLocal(now));
    setStartLocal(formatDatetimeLocal(new Date(now.getTime() - hours * 60 * 60 * 1000)));
  }

  const search = useCallback(async () => {
    if (!projectId || !startLocal || !endLocal) return;
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams({
        projectId,
        startTime: toIsoFromDatetimeLocal(startLocal),
        endTime: toIsoFromDatetimeLocal(endLocal),
        limit: String(limit),
      });
      if (logFileId.trim()) qs.set('logFileId', logFileId.trim());
      if (deviceMac.trim()) qs.set('deviceMac', deviceMac.trim());

      const data = await apiFetch<CommandChainsResponse>(`/api/logs/commands?${qs.toString()}`);
      setChains(data.items);
    } catch (e: unknown) {
      const msg = e instanceof ApiClientError ? `${e.code}: ${e.message}` : String(e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [projectId, startLocal, endLocal, limit, logFileId, deviceMac]);

  useEffect(() => {
    if (!autoSearch || autoSearchDone) return;
    if (!projectId || !startLocal || !endLocal) return;
    setAutoSearchDone(true);
    void search();
  }, [autoSearch, autoSearchDone, projectId, logFileId, startLocal, endLocal, deviceMac, limit, search]);

  // Statistics
  const stats = useMemo(() => {
    const total = chains.length;
    const success = chains.filter((c) => c.status === 'success').length;
    const timeout = chains.filter((c) => c.status === 'timeout').length;
    const errorCount = chains.filter((c) => c.status === 'error').length;
    const pending = chains.filter((c) => c.status === 'pending').length;
    const avgDuration = total > 0 ? chains.reduce((sum, c) => sum + c.duration, 0) / total : 0;
    return { total, success, timeout, error: errorCount, pending, avgDuration };
  }, [chains]);
  const buildQuickLinkHref = useCallback((base: string) => {
    const qs = new URLSearchParams();
    if (projectId.trim()) qs.set('projectId', projectId.trim());
    if (logFileId.trim()) qs.set('logFileId', logFileId.trim());
    if (startLocal && endLocal) {
      qs.set('startTime', toIsoFromDatetimeLocal(startLocal));
      qs.set('endTime', toIsoFromDatetimeLocal(endLocal));
    }
    if (base === '/logs/trace' && deviceMac.trim()) {
      qs.set('type', 'deviceMac');
      qs.set('value', deviceMac.trim());
    }
    return qs.size ? `${base}?${qs.toString()}` : base;
  }, [projectId, logFileId, startLocal, endLocal, deviceMac]);
  const quickLinks = [
    { href: buildQuickLinkHref('/logs/trace'), icon: GitBranch, label: t('logs.trace') },
    { href: buildQuickLinkHref('/logs/files'), icon: FileText, label: t('logs.files.browse') },
  ];

  return (
    <div className="mx-auto w-full max-w-[1560px] space-y-6 p-6">
      {/* Header */}
      <motion.div
        variants={fadeIn}
        initial="initial"
        animate="animate"
      >
        <PageHeader
          title={t('logs.commands')}
          subtitle={t('logs.commands.description')}
          actions={(
            <>
              <PageHeaderActionButton asChild className="gap-2">
                <Link href="/logs">
                  <ArrowLeft size={16} />
                  {t('common.back')}
                </Link>
              </PageHeaderActionButton>
              {quickLinks.map((link) => (
                <PageHeaderActionButton key={link.href} asChild className="gap-2">
                  <Link href={link.href}>
                    <link.icon size={16} />
                    {link.label}
                  </Link>
                </PageHeaderActionButton>
              ))}
            </>
          )}
        />
      </motion.div>

      {/* Filters */}
      <motion.div
        variants={fadeIn}
        initial="initial"
        animate="animate"
        transition={{ delay: 0.1 }}
      >
        <Card className="glass border-white/[0.08]">
          <CardContent className="space-y-4 p-4">
            <ProjectPicker projectId={projectId} onChange={setProjectId} />

            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                {t('logs.logFileIdOptional')}
              </label>
              <Input
                value={logFileId}
                onChange={(e) => setLogFileId(e.target.value)}
                placeholder={t('logs.trace.logFileIdPlaceholder')}
                className="bg-card/50"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">
                  {t('logs.commands.deviceMacOptional')}
                </label>
                <Input
                  value={deviceMac}
                  onChange={(e) => setDeviceMac(e.target.value)}
                  placeholder={t('logs.trace.type.deviceMacPlaceholder')}
                  className="bg-card/50"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">{t('logs.startTime')}</label>
                <Input
                  type="datetime-local"
                  value={startLocal}
                  onChange={(e) => setStartLocal(e.target.value)}
                  className="bg-card/50"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">{t('logs.endTime')}</label>
                <Input
                  type="datetime-local"
                  value={endLocal}
                  onChange={(e) => setEndLocal(e.target.value)}
                  className="bg-card/50"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">{t('logs.limit')}</label>
                <Input
                  type="number"
                  min={1}
                  max={500}
                  value={limit}
                  onChange={(e) => {
                    const n = e.currentTarget.valueAsNumber;
                    if (Number.isFinite(n)) setLimit(Math.min(Math.max(Math.trunc(n), 1), 500));
                  }}
                  className="bg-card/50"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <PageHeaderActionButton disabled={loading} onClick={() => setPresetRange(1)}>
                {t('logs.preset.1h')}
              </PageHeaderActionButton>
              <PageHeaderActionButton disabled={loading} onClick={() => setPresetRange(24)}>
                {t('logs.preset.24h')}
              </PageHeaderActionButton>
              <PageHeaderActionButton disabled={loading} onClick={() => setPresetRange(24 * 7)}>
                {t('logs.preset.7d')}
              </PageHeaderActionButton>
              <PageHeaderActionButton
                disabled={!canSearch || loading}
                onClick={() => void search()}
                className="gap-2"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search size={16} />}
                {t('common.search')}
              </PageHeaderActionButton>
            </div>

            {/* Error */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"
                >
                  <AlertCircle size={16} />
                  {error}
                </motion.div>
              )}
            </AnimatePresence>
          </CardContent>
        </Card>
      </motion.div>

      {/* Stats */}
      <AnimatePresence>
        {chains.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <Card className="glass border-white/[0.08]">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity size={18} />
                  {t('logs.commands.stats')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                  <div className="rounded-lg border border-white/[0.08] bg-muted/30 p-3">
                    <div className="text-xs text-muted-foreground">{t('logs.commands.total')}</div>
                    <div className="text-2xl font-bold">{stats.total}</div>
                  </div>
                  <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                    <div className="text-xs text-muted-foreground">{t('logs.commands.success')}</div>
                    <div className="text-2xl font-bold text-emerald-400">{stats.success}</div>
                  </div>
                  <div className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/20">
                    <div className="text-xs text-muted-foreground">{t('logs.commands.timeout')}</div>
                    <div className="text-2xl font-bold text-orange-400">{stats.timeout}</div>
                  </div>
                  <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                    <div className="text-xs text-muted-foreground">{t('logs.commands.error')}</div>
                    <div className="text-2xl font-bold text-red-400">{stats.error}</div>
                  </div>
                  <div className="rounded-lg border border-white/[0.08] bg-muted/30 p-3">
                    <div className="text-xs text-muted-foreground">{t('logs.commands.pending')}</div>
                    <div className="text-2xl font-bold text-muted-foreground">{stats.pending}</div>
                  </div>
                  <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
                    <div className="text-xs text-muted-foreground">{t('logs.commands.avgDuration')}</div>
                    <div className="text-2xl font-bold text-primary">{formatDuration(stats.avgDuration)}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Command Chains List */}
      <motion.div
        variants={fadeIn}
        initial="initial"
        animate="animate"
        transition={{ delay: 0.15 }}
      >
        <Card className="glass border-white/[0.08]">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap size={18} />
              {t('logs.commands.list')}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading && chains.length === 0 ? (
              <div className="p-4 space-y-3">
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </div>
            ) : chains.length === 0 ? (
              <div className="p-8 text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted/50 flex items-center justify-center">
                  <Zap size={24} className="text-muted-foreground" />
                </div>
                <p className="text-muted-foreground">{t('common.noData')}</p>
              </div>
            ) : (
              <motion.div
                variants={staggerContainer}
                initial="initial"
                animate="animate"
                className="divide-y divide-white/[0.06]"
              >
                {chains.map((chain, index) => (
                  <motion.div
                    key={chain.requestId}
                    variants={staggerItem}
                    custom={index}
                  >
                    {/* Chain Header */}
                    <div
                      className="p-4 hover:bg-primary/5 transition-colors cursor-pointer"
                      onClick={() => setExpandedId(expandedId === chain.requestId ? null : chain.requestId)}
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="flex-shrink-0">
                            {expandedId === chain.requestId ? (
                              <ChevronDown size={18} className="text-muted-foreground" />
                            ) : (
                              <ChevronRight size={18} className="text-muted-foreground" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-xs text-primary truncate max-w-[200px]">
                                {chain.requestId}
                              </span>
                              {getStatusBadge(chain.status, t)}
                            </div>
                            <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                              <span>{chain.deviceMac ?? '-'}</span>
                              <span className="flex items-center gap-1">
                                <Activity size={12} />
                                {chain.eventCount} {t('common.events')}
                              </span>
                              <span className="flex items-center gap-1">
                                <Timer size={12} />
                                {formatDuration(chain.duration)}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(chain.startTime).toLocaleString(localeTag)}
                        </div>
                      </div>
                    </div>

                    {/* Expanded Event Chain */}
                    <AnimatePresence>
                      {expandedId === chain.requestId && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="px-4 pb-4 pt-0">
                            <div className="space-y-3 rounded-lg border border-white/[0.08] bg-background/50 p-4">
                              <h4 className="text-sm font-medium text-muted-foreground mb-3">
                                {t('logs.commands.eventChain')}
                              </h4>
                              {chain.events.map((event, idx) => (
                                <motion.div
                                  key={event.id}
                                  initial={{ opacity: 0, x: -10 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  transition={{ delay: idx * 0.03 }}
                                  className="flex items-start gap-3 rounded-lg border border-white/[0.06] bg-muted/20 p-3"
                                >
                                  <div className={cn('w-2 h-2 rounded-full mt-2 flex-shrink-0', getLevelColor(event.level))} />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-medium text-foreground">{event.eventName}</span>
                                      {event.errorCode && (
                                        <Badge variant="destructive" className="text-xs">
                                          {event.errorCode}
                                        </Badge>
                                      )}
                                      <span className="text-xs text-muted-foreground">
                                        {new Date(event.timestampMs).toLocaleString(localeTag)}
                                      </span>
                                      {idx > 0 && (
                                        <Badge variant="outline" className="text-xs bg-purple-500/10 text-purple-400 border-purple-500/30">
                                          +{event.timestampMs - chain.events[idx - 1].timestampMs}ms
                                        </Badge>
                                      )}
                                    </div>
                                    {event.msg && (
                                      <p className="mt-1 text-xs text-muted-foreground break-words">
                                        {event.msg}
                                      </p>
                                    )}
                                  </div>
                                  <PageHeaderActionButton
                                    asChild
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 flex-shrink-0 gap-1 text-xs"
                                  >
                                    <Link
                                      href={`/logs?q=${encodeURIComponent(event.eventName)}&startMs=${event.timestampMs - 60000}&endMs=${event.timestampMs + 60000}`}
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <ExternalLink size={12} />
                                      {t('common.view')}
                                    </Link>
                                  </PageHeaderActionButton>
                                </motion.div>
                              ))}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
