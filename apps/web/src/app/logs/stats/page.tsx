'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, BarChart3, AlertTriangle, Activity, Layers, RefreshCw, TrendingUp, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ProjectPicker } from '@/components/ProjectPicker';
import { ApiClientError, apiFetch } from '@/lib/api';
import { getProjectId } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { getActiveLogFileId, setActiveLogFileId } from '@/lib/log-file-scope';

type StatsResponse = {
  totalEvents: number;
  byEventName: { eventName: string; count: number }[];
  byLevel: { level: number; count: number }[];
  errorRate: number;
};

type ErrorHotspot = {
  eventName: string;
  errorCode: string | null;
  count: number;
  lastSeenMs: number | null;
};

type ErrorHotspotsResponse = {
  items: ErrorHotspot[];
};

const fadeIn = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } },
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
};

const staggerItem = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' as const } },
};

function formatDatetimeLocal(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toIsoFromDatetimeLocal(value: string) {
  const d = new Date(value);
  return d.toISOString();
}

function getLevelConfig(level: number): { label: string; color: string; bgClass: string; borderClass: string } {
  switch (level) {
    case 1:
      return { label: 'INFO', color: 'text-blue-400', bgClass: 'bg-blue-500/10', borderClass: 'border-blue-500/20' };
    case 2:
      return { label: 'DEBUG', color: 'text-emerald-400', bgClass: 'bg-emerald-500/10', borderClass: 'border-emerald-500/20' };
    case 3:
      return { label: 'WARN', color: 'text-amber-400', bgClass: 'bg-amber-500/10', borderClass: 'border-amber-500/20' };
    case 4:
      return { label: 'ERROR', color: 'text-red-400', bgClass: 'bg-red-500/10', borderClass: 'border-red-500/20' };
    default:
      return { label: `L${level}`, color: 'text-gray-400', bgClass: 'bg-gray-500/10', borderClass: 'border-gray-500/20' };
  }
}

export default function StatsPage() {
  const { localeTag, t } = useI18n();
  const lastProjectIdRef = useRef<string | null>(null);
  const [projectId, setProjectId] = useState('');
  const [logFileId, setLogFileId] = useState('');
  const [startLocal, setStartLocal] = useState('');
  const [endLocal, setEndLocal] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [hotspots, setHotspots] = useState<ErrorHotspotsResponse | null>(null);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setProjectId(getProjectId() ?? '');
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

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

  useEffect(() => {
    const now = new Date();
    setEndLocal(formatDatetimeLocal(now));
    setStartLocal(formatDatetimeLocal(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)));
  }, []);

  async function loadStats() {
    if (!projectId) return;
    setLoading(true);
    setError('');

    try {
      const qs = new URLSearchParams({ projectId });
      if (logFileId.trim()) qs.set('logFileId', logFileId.trim());
      if (startLocal) qs.set('startTime', toIsoFromDatetimeLocal(startLocal));
      if (endLocal) qs.set('endTime', toIsoFromDatetimeLocal(endLocal));

      const [statsData, hotspotsData] = await Promise.all([
        apiFetch<StatsResponse>(`/api/logs/stats?${qs.toString()}`),
        startLocal && endLocal
          ? apiFetch<ErrorHotspotsResponse>(
              `/api/logs/stats/errors?${new URLSearchParams({
                projectId,
                ...(logFileId.trim() ? { logFileId: logFileId.trim() } : {}),
                startTime: toIsoFromDatetimeLocal(startLocal),
                endTime: toIsoFromDatetimeLocal(endLocal),
              }).toString()}`
            )
          : Promise.resolve({ items: [] }),
      ]);

      setStats(statsData);
      setHotspots(hotspotsData);
    } catch (e: unknown) {
      const msg = e instanceof ApiClientError ? `${e.code}: ${e.message}` : String(e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  const maxEventCount = stats?.byEventName.reduce((max, e) => Math.max(max, e.count), 0) ?? 1;

  return (
    <motion.div
      className="space-y-6"
      initial="hidden"
      animate="visible"
      variants={staggerContainer}
    >
      {/* Header */}
      <motion.div variants={fadeIn}>
        <Card className="glass">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-violet-500/10 border border-violet-500/20">
                  <BarChart3 className="w-5 h-5 text-violet-400" />
                </div>
                <CardTitle className="text-xl">{t('logs.stats')}</CardTitle>
              </div>
              <Button asChild variant="outline" size="sm" className="gap-2">
                <Link href="/logs">
                  <ArrowLeft className="w-4 h-4" />
                  {t('common.back')}
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-4 items-end">
              <div className="min-w-[200px]">
                <ProjectPicker projectId={projectId} onChange={setProjectId} />
              </div>
              <div className="flex-1 min-w-[200px]">
                <label className="block text-sm text-muted-foreground mb-1.5">
                  {t('logs.logFileIdOptional')}
                </label>
                <Input
                  value={logFileId}
                  onChange={(e) => setLogFileId(e.target.value)}
                  placeholder="Filter by logFileId (optional)"
                  className="bg-card/50"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-4 items-end">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-sm text-muted-foreground mb-1.5">
                  {t('logs.startTime')}
                </label>
                <Input
                  type="datetime-local"
                  value={startLocal}
                  onChange={(e) => setStartLocal(e.target.value)}
                  className="bg-card/50"
                />
              </div>
              <div className="flex-1 min-w-[200px]">
                <label className="block text-sm text-muted-foreground mb-1.5">
                  {t('logs.endTime')}
                </label>
                <Input
                  type="datetime-local"
                  value={endLocal}
                  onChange={(e) => setEndLocal(e.target.value)}
                  className="bg-card/50"
                />
              </div>
              <Button
                disabled={!projectId || loading}
                onClick={() => void loadStats()}
                className="gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                {loading ? t('common.loading') : t('common.refresh')}
              </Button>
            </div>

            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm"
                >
                  {error}
                </motion.div>
              )}
            </AnimatePresence>
          </CardContent>
        </Card>
      </motion.div>

      {/* Loading State */}
      <AnimatePresence>
        {loading && !stats && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-6"
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="glass">
                  <CardContent className="p-6">
                    <Skeleton className="h-4 w-24 mb-3" />
                    <Skeleton className="h-10 w-32" />
                  </CardContent>
                </Card>
              ))}
            </div>
            <Card className="glass">
              <CardContent className="p-6 space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Stats Content */}
      <AnimatePresence>
        {stats && (
          <motion.div
            initial="hidden"
            animate="visible"
            variants={staggerContainer}
            className="space-y-6"
          >
            {/* Overview Cards */}
            <motion.div variants={staggerItem} className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Total Events */}
              <Card className="glass group hover:border-blue-500/30 transition-colors">
                <CardContent className="p-6">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 group-hover:bg-blue-500/15 transition-colors">
                      <Activity className="w-4 h-4 text-blue-400" />
                    </div>
                    <span className="text-sm text-muted-foreground">Total Events</span>
                  </div>
                  <motion.div
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5, delay: 0.2 }}
                    className="text-3xl font-semibold text-blue-400 tabular-nums"
                  >
                    {stats.totalEvents.toLocaleString()}
                  </motion.div>
                </CardContent>
              </Card>

              {/* Error Rate */}
              <Card className={`glass group transition-colors ${
                stats.errorRate > 5
                  ? 'hover:border-red-500/30'
                  : stats.errorRate > 1
                    ? 'hover:border-amber-500/30'
                    : 'hover:border-emerald-500/30'
              }`}>
                <CardContent className="p-6">
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`p-2 rounded-lg border transition-colors ${
                      stats.errorRate > 5
                        ? 'bg-red-500/10 border-red-500/20 group-hover:bg-red-500/15'
                        : stats.errorRate > 1
                          ? 'bg-amber-500/10 border-amber-500/20 group-hover:bg-amber-500/15'
                          : 'bg-emerald-500/10 border-emerald-500/20 group-hover:bg-emerald-500/15'
                    }`}>
                      <AlertTriangle className={`w-4 h-4 ${
                        stats.errorRate > 5 ? 'text-red-400' : stats.errorRate > 1 ? 'text-amber-400' : 'text-emerald-400'
                      }`} />
                    </div>
                    <span className="text-sm text-muted-foreground">Error Rate</span>
                  </div>
                  <motion.div
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5, delay: 0.3 }}
                    className={`text-3xl font-semibold tabular-nums ${
                      stats.errorRate > 5 ? 'text-red-400' : stats.errorRate > 1 ? 'text-amber-400' : 'text-emerald-400'
                    }`}
                  >
                    {stats.errorRate.toFixed(2)}%
                  </motion.div>
                </CardContent>
              </Card>

              {/* Event Types */}
              <Card className="glass group hover:border-violet-500/30 transition-colors">
                <CardContent className="p-6">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-2 rounded-lg bg-violet-500/10 border border-violet-500/20 group-hover:bg-violet-500/15 transition-colors">
                      <Layers className="w-4 h-4 text-violet-400" />
                    </div>
                    <span className="text-sm text-muted-foreground">Event Types</span>
                  </div>
                  <motion.div
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5, delay: 0.4 }}
                    className="text-3xl font-semibold text-violet-400 tabular-nums"
                  >
                    {stats.byEventName.length}
                  </motion.div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Level Distribution */}
            <motion.div variants={staggerItem}>
              <Card className="glass">
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-muted-foreground" />
                    <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                      Level Distribution
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {stats.byLevel.map((item, index) => {
                      const config = getLevelConfig(item.level);
                      return (
                        <motion.div
                          key={item.level}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.4, delay: 0.1 * index }}
                          className={`p-4 rounded-xl ${config.bgClass} border ${config.borderClass} hover:scale-[1.02] transition-transform`}
                        >
                          <div className={`text-xs font-medium ${config.color} mb-2 tracking-wide`}>
                            {config.label}
                          </div>
                          <div className="text-2xl font-semibold text-foreground/90 tabular-nums">
                            {item.count.toLocaleString()}
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Top Events */}
            <motion.div variants={staggerItem}>
              <Card className="glass">
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-muted-foreground" />
                    <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                      Top Events
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1">
                    {stats.byEventName.slice(0, 12).map((item, index) => {
                      const percentage = (item.count / maxEventCount) * 100;
                      return (
                        <motion.div
                          key={item.eventName}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ duration: 0.4, delay: 0.05 * index }}
                          className="grid grid-cols-[32px_180px_1fr_90px] md:grid-cols-[32px_220px_1fr_100px] items-center gap-4 p-2 rounded-lg hover:bg-white/[0.02] transition-colors"
                        >
                          <div className="text-xs text-muted-foreground text-right tabular-nums">
                            {index + 1}
                          </div>
                          <div className="text-sm font-medium text-foreground/80 truncate">
                            {item.eventName}
                          </div>
                          <div className="h-2 bg-white/[0.04] rounded-full overflow-hidden">
                            <motion.div
                              initial={{ scaleX: 0 }}
                              animate={{ scaleX: 1 }}
                              transition={{ duration: 0.6, delay: 0.1 * index, ease: 'easeOut' }}
                              style={{ width: `${percentage}%`, transformOrigin: 'left' }}
                              className="h-full bg-gradient-to-r from-blue-500/60 to-violet-500/60 rounded-full"
                            />
                          </div>
                          <div className="text-sm text-muted-foreground text-right tabular-nums">
                            {item.count.toLocaleString()}
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                  {stats.byEventName.length > 12 && (
                    <div className="mt-4 pt-4 border-t border-white/[0.06] text-center text-xs text-muted-foreground">
                      + {stats.byEventName.length - 12} more events
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>

            {/* Error Hotspots */}
            {hotspots && hotspots.items.length > 0 && (
              <motion.div variants={staggerItem}>
                <Card className="glass border-red-500/20">
                  <CardHeader className="pb-4">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-red-400" />
                      <CardTitle className="text-sm font-medium text-red-400 uppercase tracking-wider">
                        Error Hotspots
                      </CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-white/[0.06]">
                            <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider py-3 px-2">
                              Event
                            </th>
                            <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider py-3 px-2">
                              Error Code
                            </th>
                            <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider py-3 px-2">
                              Count
                            </th>
                            <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider py-3 px-2">
                              Last Seen
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {hotspots.items.slice(0, 10).map((item, index) => (
                            <motion.tr
                              key={`${item.eventName}-${item.errorCode}-${index}`}
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              transition={{ duration: 0.3, delay: 0.05 * index }}
                              className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors"
                            >
                              <td className="py-3 px-2 font-medium text-foreground/80 text-sm">
                                {item.eventName}
                              </td>
                              <td className="py-3 px-2">
                                {item.errorCode ? (
                                  <Badge variant="destructive" className="text-xs">
                                    {item.errorCode}
                                  </Badge>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </td>
                              <td className="py-3 px-2 text-right tabular-nums text-sm text-foreground/70">
                                {item.count.toLocaleString()}
                              </td>
                              <td className="py-3 px-2 text-sm text-muted-foreground">
                                <div className="flex items-center gap-1.5">
                                  <Clock className="w-3.5 h-3.5" />
                                  {item.lastSeenMs ? new Date(item.lastSeenMs).toLocaleString(localeTag) : '-'}
                                </div>
                              </td>
                            </motion.tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Empty State */}
            {stats.totalEvents === 0 && (
              <motion.div variants={fadeIn}>
                <Card className="glass">
                  <CardContent className="py-12 text-center">
                    <BarChart3 className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                    <p className="text-muted-foreground">{t('logs.empty')}</p>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
