'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Zap,
  Search,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
  Timer,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  ArrowLeft,
  Activity,
  XCircle,
  Hourglass,
} from 'lucide-react';
import { ProjectPicker } from '@/components/ProjectPicker';
import { ApiClientError, apiFetch } from '@/lib/api';
import { getProjectId } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
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
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'success':
      return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">success</Badge>;
    case 'timeout':
      return <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30">timeout</Badge>;
    case 'error':
      return <Badge variant="destructive">error</Badge>;
    case 'pending':
      return <Badge variant="secondary">pending</Badge>;
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
  const [projectId, setProjectId] = useState('');
  const [deviceMac, setDeviceMac] = useState('');
  const [startLocal, setStartLocal] = useState('');
  const [endLocal, setEndLocal] = useState('');
  const [limit, setLimit] = useState(100);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [chains, setChains] = useState<CommandChain[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setProjectId(getProjectId() ?? '');
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    const now = new Date();
    setEndLocal(formatDatetimeLocal(now));
    setStartLocal(formatDatetimeLocal(new Date(now.getTime() - 24 * 60 * 60 * 1000)));
  }, []);

  const canSearch = useMemo(() => Boolean(projectId && startLocal && endLocal), [projectId, startLocal, endLocal]);

  function setPresetRange(hours: number) {
    const now = new Date();
    setEndLocal(formatDatetimeLocal(now));
    setStartLocal(formatDatetimeLocal(new Date(now.getTime() - hours * 60 * 60 * 1000)));
  }

  async function search() {
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
      if (deviceMac.trim()) qs.set('deviceMac', deviceMac.trim());

      const data = await apiFetch<CommandChainsResponse>(`/api/logs/commands?${qs.toString()}`);
      setChains(data.items);
    } catch (e: unknown) {
      const msg = e instanceof ApiClientError ? `${e.code}: ${e.message}` : String(e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

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

  return (
    <div className="space-y-4">
      {/* Header */}
      <motion.div
        variants={fadeIn}
        initial="initial"
        animate="animate"
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold gradient-text">{t('logs.commands')}</h1>
            <p className="text-sm text-muted-foreground">
              {loading ? t('common.loading') : t('common.items', { count: chains.length })}
            </p>
          </div>
        </div>
        <Link href="/logs">
          <Button variant="outline" size="sm" className="gap-2">
            <ArrowLeft size={16} />
            {t('common.back')}
          </Button>
        </Link>
      </motion.div>

      {/* Description */}
      <motion.div
        variants={fadeIn}
        initial="initial"
        animate="animate"
        transition={{ delay: 0.05 }}
      >
        <Card className="glass border-border/50">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">{t('logs.commands.description')}</p>
          </CardContent>
        </Card>
      </motion.div>

      {/* Filters */}
      <motion.div
        variants={fadeIn}
        initial="initial"
        animate="animate"
        transition={{ delay: 0.1 }}
      >
        <Card className="glass border-border/50">
          <CardContent className="p-4 space-y-4">
            <ProjectPicker projectId={projectId} onChange={setProjectId} />

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  deviceMac ({t('common.optional')})
                </label>
                <Input
                  value={deviceMac}
                  onChange={(e) => setDeviceMac(e.target.value)}
                  placeholder="e.g. AA:BB:CC:DD:EE:FF"
                />
              </div>
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
                <label className="text-xs text-muted-foreground mb-1 block">{t('logs.limit')}</label>
                <Input
                  type="number"
                  min={1}
                  max={500}
                  value={limit}
                  onChange={(e) => {
                    const n = e.currentTarget.valueAsNumber;
                    if (Number.isFinite(n)) setLimit(Math.min(Math.max(Math.trunc(n), 1), 500));
                  }}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" disabled={loading} onClick={() => setPresetRange(1)}>
                {t('logs.preset.1h')}
              </Button>
              <Button variant="outline" size="sm" disabled={loading} onClick={() => setPresetRange(24)}>
                {t('logs.preset.24h')}
              </Button>
              <Button variant="outline" size="sm" disabled={loading} onClick={() => setPresetRange(24 * 7)}>
                {t('logs.preset.7d')}
              </Button>
              <Button
                size="sm"
                disabled={!canSearch || loading}
                onClick={() => void search()}
                className="gap-2"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search size={16} />}
                {t('common.search')}
              </Button>
            </div>

            {/* Error */}
            <AnimatePresence>
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

      {/* Stats */}
      <AnimatePresence>
        {chains.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <Card className="glass border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity size={18} />
                  {t('logs.commands.stats')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                  <div className="p-3 rounded-lg bg-muted/30 border border-border/30">
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
                  <div className="p-3 rounded-lg bg-muted/30 border border-border/30">
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
        <Card className="glass border-border/50">
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
                className="divide-y divide-border/30"
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
                              {getStatusBadge(chain.status)}
                            </div>
                            <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                              <span>{chain.deviceMac ?? '-'}</span>
                              <span className="flex items-center gap-1">
                                <Activity size={12} />
                                {chain.eventCount} events
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
                            <div className="p-4 rounded-lg bg-background/50 border border-border/30 space-y-3">
                              <h4 className="text-sm font-medium text-muted-foreground mb-3">
                                {t('logs.commands.eventChain')}
                              </h4>
                              {chain.events.map((event, idx) => (
                                <motion.div
                                  key={event.id}
                                  initial={{ opacity: 0, x: -10 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  transition={{ delay: idx * 0.03 }}
                                  className="flex items-start gap-3 p-3 rounded-lg bg-muted/20 border border-border/20"
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
                                  <Link
                                    href={`/logs?q=${encodeURIComponent(event.eventName)}&startMs=${event.timestampMs - 60000}&endMs=${event.timestampMs + 60000}`}
                                    className="flex-shrink-0"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
                                      <ExternalLink size={12} />
                                      {t('common.view')}
                                    </Button>
                                  </Link>
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
