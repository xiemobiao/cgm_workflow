'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, FileText, RefreshCw, ChevronRight, Clock, CheckCircle2, XCircle, Loader2, AlertCircle, Activity, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ProjectPicker } from '@/components/ProjectPicker';
import { ApiClientError, apiFetch } from '@/lib/api';
import { getProjectId } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';

type LogFileItem = {
  id: string;
  fileName: string;
  status: 'queued' | 'parsed' | 'failed';
  parserVersion: string | null;
  uploadedAt: string;
  eventCount: number;
  errorCount: number;
  qualityScore: number | null;
  analysisStatus: 'pending' | 'analyzing' | 'completed' | 'failed' | null;
};

type ListResponse = { items: LogFileItem[]; nextCursor: string | null };

const fadeIn = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } },
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
};

const staggerItem = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' as const } },
};

function getStatusConfig(status: LogFileItem['status']) {
  switch (status) {
    case 'parsed':
      return {
        label: 'Parsed',
        icon: CheckCircle2,
        color: 'text-emerald-400',
        bgClass: 'bg-emerald-500/10',
        borderClass: 'border-emerald-500/20',
      };
    case 'failed':
      return {
        label: 'Failed',
        icon: XCircle,
        color: 'text-red-400',
        bgClass: 'bg-red-500/10',
        borderClass: 'border-red-500/20',
      };
    case 'queued':
    default:
      return {
        label: 'Queued',
        icon: Loader2,
        color: 'text-amber-400',
        bgClass: 'bg-amber-500/10',
        borderClass: 'border-amber-500/20',
      };
  }
}

export default function LogFilesPage() {
  const { localeTag, t } = useI18n();
  const router = useRouter();

  const [projectId, setProjectId] = useState('');
  const [limit, setLimit] = useState(20);
  const [cursor, setCursor] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [items, setItems] = useState<LogFileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const id = window.setTimeout(() => {
      setProjectId(getProjectId() ?? '');
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem('cgm_log_files_limit');
    const n = saved ? Number(saved) : NaN;
    if (Number.isFinite(n) && n >= 1 && n <= 100) {
      setLimit(Math.trunc(n));
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('cgm_log_files_limit', String(limit));
  }, [limit]);

  const canLoad = useMemo(() => Boolean(projectId), [projectId]);
  const loadRef = useRef<(resetCursor: boolean) => Promise<void>>(async () => {});

  async function load(resetCursor: boolean) {
    if (!projectId) return;
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams({ projectId, limit: String(limit) });
      if (!resetCursor && cursor) qs.set('cursor', cursor);
      const data = await apiFetch<ListResponse>(`/api/logs/files?${qs.toString()}`);
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

  loadRef.current = load;

  useEffect(() => {
    if (!projectId) return;
    void loadRef.current(true);
  }, [projectId]);

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
                <div className="p-2 rounded-lg bg-orange-500/10 border border-orange-500/20">
                  <FileText className="w-5 h-5 text-orange-400" />
                </div>
                <CardTitle className="text-xl">{t('logs.files.title')}</CardTitle>
              </div>
              <Button asChild variant="outline" size="sm" className="gap-2">
                <Link href="/logs">
                  <ArrowLeft className="w-4 h-4" />
                  {t('logs.files.backToLogs')}
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-4 items-end">
              <div className="min-w-[200px]">
                <ProjectPicker projectId={projectId} onChange={setProjectId} />
              </div>
              <div className="w-32">
                <label className="block text-sm text-muted-foreground mb-1.5">
                  {t('logs.limit')}
                </label>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={limit}
                  onChange={(e) => {
                    const n = e.currentTarget.valueAsNumber;
                    if (!Number.isFinite(n)) return;
                    setLimit(Math.min(Math.max(Math.trunc(n), 1), 100));
                  }}
                  className="bg-card/50"
                />
              </div>
              <Button
                disabled={!canLoad || loading}
                onClick={() => void load(true)}
                className="gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                {t('common.refresh')}
              </Button>
              <Button
                variant="outline"
                disabled={!canLoad || loading || !nextCursor}
                onClick={() => void load(false)}
              >
                {t('common.loadMore')}
              </Button>
              <div className="flex items-center gap-2 text-sm text-muted-foreground ml-auto">
                <Activity className="w-4 h-4" />
                {loading ? t('common.loading') : t('common.items', { count: items.length })}
              </div>
            </div>

            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2"
                >
                  <AlertCircle className="w-4 h-4" />
                  {error}
                </motion.div>
              )}
            </AnimatePresence>
          </CardContent>
        </Card>
      </motion.div>

      {/* Loading State */}
      <AnimatePresence>
        {loading && items.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <Card className="glass">
              <CardContent className="p-6 space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* File List */}
      <AnimatePresence>
        {items.length > 0 && (
          <motion.div variants={staggerItem} initial="hidden" animate="visible">
            <Card className="glass overflow-hidden">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-white/[0.06]">
                        <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider py-4 px-4">
                          {t('logs.files.uploadedAt')}
                        </th>
                        <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider py-4 px-4">
                          {t('logs.files.fileName')}
                        </th>
                        <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider py-4 px-4">
                          {t('logs.files.status')}
                        </th>
                        <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider py-4 px-4">
                          {t('logs.files.events')}
                        </th>
                        <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider py-4 px-4">
                          {t('logs.files.errors')}
                        </th>
                        <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wider py-4 px-4">
                          Quality
                        </th>
                        <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider py-4 px-4 w-10">
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((f, index) => {
                        const statusConfig = getStatusConfig(f.status);
                        const StatusIcon = statusConfig.icon;
                        return (
                          <motion.tr
                            key={f.id}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.3, delay: 0.03 * index }}
                            onClick={() => router.push(`/logs/files/${f.id}`)}
                            className="border-b border-white/[0.03] hover:bg-white/[0.02] cursor-pointer group transition-colors"
                          >
                            <td className="py-4 px-4 text-sm text-muted-foreground whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                <Clock className="w-3.5 h-3.5" />
                                {new Date(f.uploadedAt).toLocaleString(localeTag)}
                              </div>
                            </td>
                            <td className="py-4 px-4">
                              <div className="flex items-center gap-2">
                                <FileText className="w-4 h-4 text-orange-400" />
                                <span className="text-sm font-medium text-foreground/90 truncate max-w-[300px]">
                                  {f.fileName}
                                </span>
                              </div>
                            </td>
                            <td className="py-4 px-4">
                              <Badge
                                variant="outline"
                                className={`${statusConfig.color} border-current text-xs gap-1`}
                              >
                                <StatusIcon className={`w-3 h-3 ${f.status === 'queued' ? 'animate-spin' : ''}`} />
                                {t(`logs.fileStatus.${f.status}`)}
                              </Badge>
                            </td>
                            <td className="py-4 px-4 text-right">
                              <span className="text-sm tabular-nums text-foreground/70">
                                {f.eventCount.toLocaleString()}
                              </span>
                            </td>
                            <td className="py-4 px-4 text-right">
                              {f.errorCount > 0 ? (
                                <span className="inline-flex items-center gap-1.5 text-sm tabular-nums text-red-400">
                                  <AlertTriangle className="w-3.5 h-3.5" />
                                  {f.errorCount.toLocaleString()}
                                </span>
                              ) : (
                                <span className="text-sm tabular-nums text-muted-foreground">0</span>
                              )}
                            </td>
                            <td className="py-4 px-4 text-center">
                              {f.analysisStatus === 'completed' && f.qualityScore !== null ? (
                                <Badge
                                  variant="outline"
                                  className={`text-xs gap-1 ${
                                    f.qualityScore >= 80
                                      ? 'text-emerald-400 border-emerald-500/30'
                                      : f.qualityScore >= 60
                                        ? 'text-amber-400 border-amber-500/30'
                                        : 'text-red-400 border-red-500/30'
                                  }`}
                                >
                                  <Activity className="w-3 h-3" />
                                  {f.qualityScore}
                                </Badge>
                              ) : f.analysisStatus === 'analyzing' ? (
                                <Badge variant="outline" className="text-xs gap-1 text-blue-400 border-blue-500/30">
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                  Analyzing
                                </Badge>
                              ) : f.analysisStatus === 'failed' ? (
                                <Badge variant="outline" className="text-xs gap-1 text-red-400 border-red-500/30">
                                  <XCircle className="w-3 h-3" />
                                  Failed
                                </Badge>
                              ) : (
                                <span className="text-xs text-muted-foreground">-</span>
                              )}
                            </td>
                            <td className="py-4 px-4 text-right">
                              <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                            </td>
                          </motion.tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Empty State */}
      <AnimatePresence>
        {!loading && items.length === 0 && projectId && (
          <motion.div variants={fadeIn} initial="hidden" animate="visible" exit="hidden">
            <Card className="glass">
              <CardContent className="py-12 text-center">
                <FileText className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                <p className="text-muted-foreground">{t('logs.files.empty')}</p>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Load More Button at Bottom */}
      <AnimatePresence>
        {nextCursor && items.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex justify-center"
          >
            <Button
              variant="outline"
              disabled={loading}
              onClick={() => void load(false)}
              className="gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t('common.loading')}
                </>
              ) : (
                <>
                  <ChevronRight className="w-4 h-4" />
                  {t('common.loadMore')}
                </>
              )}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
