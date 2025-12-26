'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Search, Link2, Hash, Bluetooth, Clock, ChevronRight, Activity, Server, AlertCircle, Tag } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ProjectPicker } from '@/components/ProjectPicker';
import { ApiClientError, apiFetch } from '@/lib/api';
import { getProjectId } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';

type TraceItem = {
  id: string;
  eventName: string;
  level: number;
  timestampMs: number;
  sdkVersion: string | null;
  appId?: string | null;
  logFileId: string;
  threadName: string | null;
  deviceMac: string | null;
  deviceSn: string | null;
  linkCode?: string | null;
  requestId: string | null;
  errorCode: string | null;
  msg: string | null;
};

type TraceResponse = {
  linkCode?: string;
  requestId?: string;
  deviceMac?: string;
  deviceSn?: string;
  count: number;
  items: TraceItem[];
};

type RelatedDevice = {
  deviceMac: string;
  eventCount: number;
  firstSeenMs: number | null;
  lastSeenMs: number | null;
};

type RelatedSession = {
  linkCode: string;
  eventCount: number;
  startTimeMs: number | null;
  endTimeMs: number | null;
};

type LinkCodeDevicesResponse = {
  linkCode: string;
  devices: RelatedDevice[];
};

type DeviceSessionsResponse = {
  deviceMac: string;
  sessions: RelatedSession[];
};

const fadeIn = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } },
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
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

function getLevelConfig(level: number): { label: string; color: string; bgClass: string; borderClass: string; dotClass: string } {
  switch (level) {
    case 1:
      return {
        label: 'INFO',
        color: 'text-blue-400',
        bgClass: 'bg-blue-500/10',
        borderClass: 'border-blue-500/20',
        dotClass: 'bg-blue-500',
      };
    case 2:
      return {
        label: 'DEBUG',
        color: 'text-emerald-400',
        bgClass: 'bg-emerald-500/10',
        borderClass: 'border-emerald-500/20',
        dotClass: 'bg-emerald-500',
      };
    case 3:
      return {
        label: 'WARN',
        color: 'text-amber-400',
        bgClass: 'bg-amber-500/10',
        borderClass: 'border-amber-500/20',
        dotClass: 'bg-amber-500',
      };
    case 4:
      return {
        label: 'ERROR',
        color: 'text-red-400',
        bgClass: 'bg-red-500/10',
        borderClass: 'border-red-500/20',
        dotClass: 'bg-red-500',
      };
    default:
      return {
        label: `L${level}`,
        color: 'text-gray-400',
        bgClass: 'bg-gray-500/10',
        borderClass: 'border-gray-500/20',
        dotClass: 'bg-gray-500',
      };
  }
}

const traceTypeOptions = [
  { value: 'linkCode', label: 'Link Code', icon: Link2, placeholder: 'e.g. abc123' },
  { value: 'requestId', label: 'Request ID', icon: Hash, placeholder: 'e.g. req-001' },
  { value: 'deviceMac', label: 'Device MAC', icon: Bluetooth, placeholder: 'e.g. AA:BB:CC:DD:EE:FF' },
  { value: 'deviceSn', label: 'Device SN', icon: Tag, placeholder: 'e.g. SN12345678' },
] as const;

export default function TracePage() {
  const { localeTag, t } = useI18n();
  const searchParams = useSearchParams();
  const [projectId, setProjectId] = useState('');
  const [traceType, setTraceType] = useState<'linkCode' | 'requestId' | 'deviceMac' | 'deviceSn'>('linkCode');
  const [traceValue, setTraceValue] = useState('');
  const [startLocal, setStartLocal] = useState('');
  const [endLocal, setEndLocal] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<TraceResponse | null>(null);
  const [relatedDevices, setRelatedDevices] = useState<RelatedDevice[]>([]);
  const [relatedSessions, setRelatedSessions] = useState<RelatedSession[]>([]);
  const [relationLoading, setRelationLoading] = useState(false);
  const [autoTrace, setAutoTrace] = useState(false);
  const [autoTraceDone, setAutoTraceDone] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => {
      const qpProjectId = searchParams.get('projectId');
      setProjectId(qpProjectId?.trim() || (getProjectId() ?? ''));

      const qpType = searchParams.get('type');
      if (qpType === 'linkCode' || qpType === 'requestId' || qpType === 'deviceMac' || qpType === 'deviceSn') {
        setTraceType(qpType);
      }

      const qpValue = searchParams.get('value');
      if (qpValue?.trim()) {
        setTraceValue(qpValue.trim());
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
        setStartLocal(formatDatetimeLocal(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)));
      }

      const qpAuto = searchParams.get('auto');
      setAutoTrace(qpAuto === '1' || qpAuto === 'true');
    }, 0);
    return () => window.clearTimeout(id);
  }, [searchParams]);

  async function trace() {
    if (!projectId || !traceValue.trim()) return;
    setLoading(true);
    setError('');
    setResult(null);
    setRelatedDevices([]);
    setRelatedSessions([]);

    try {
      let url = '';
      const qs = new URLSearchParams({ projectId });

      if (traceType === 'linkCode') {
        url = `/api/logs/trace/link-code/${encodeURIComponent(traceValue.trim())}`;
      } else if (traceType === 'requestId') {
        url = `/api/logs/trace/request-id/${encodeURIComponent(traceValue.trim())}`;
      } else if (traceType === 'deviceMac') {
        url = `/api/logs/trace/device/${encodeURIComponent(traceValue.trim())}`;
        if (startLocal && endLocal) {
          qs.set('startTime', toIsoFromDatetimeLocal(startLocal));
          qs.set('endTime', toIsoFromDatetimeLocal(endLocal));
        }
      } else if (traceType === 'deviceSn') {
        url = `/api/logs/trace/device-sn/${encodeURIComponent(traceValue.trim())}`;
        if (startLocal && endLocal) {
          qs.set('startTime', toIsoFromDatetimeLocal(startLocal));
          qs.set('endTime', toIsoFromDatetimeLocal(endLocal));
        }
      }

      const data = await apiFetch<TraceResponse>(`${url}?${qs.toString()}`);
      setResult(data);

      // Fetch related devices/sessions
      setRelationLoading(true);
      try {
        if (traceType === 'linkCode') {
          const devicesData = await apiFetch<LinkCodeDevicesResponse>(
            `/api/logs/trace/link-code/${encodeURIComponent(traceValue.trim())}/devices?projectId=${projectId}`
          );
          setRelatedDevices(devicesData.devices);
        } else if (traceType === 'deviceMac' && startLocal && endLocal) {
          const sessionsQs = new URLSearchParams({
            projectId,
            startTime: toIsoFromDatetimeLocal(startLocal),
            endTime: toIsoFromDatetimeLocal(endLocal),
          });
          const sessionsData = await apiFetch<DeviceSessionsResponse>(
            `/api/logs/trace/device/${encodeURIComponent(traceValue.trim())}/sessions?${sessionsQs.toString()}`
          );
          setRelatedSessions(sessionsData.sessions);
        }
      } catch {
        // Ignore relation fetch errors
      } finally {
        setRelationLoading(false);
      }
    } catch (e: unknown) {
      const msg = e instanceof ApiClientError ? `${e.code}: ${e.message}` : String(e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!autoTrace || autoTraceDone) return;
    if (!projectId || !traceValue.trim()) return;
    if ((traceType === 'deviceMac' || traceType === 'deviceSn') && (!startLocal || !endLocal)) return;
    setAutoTraceDone(true);
    void trace();
  }, [autoTrace, autoTraceDone, projectId, traceType, traceValue, startLocal, endLocal]);

  const selectedTypeOption = traceTypeOptions.find((o) => o.value === traceType) ?? traceTypeOptions[0];

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
                <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
                  <Search className="w-5 h-5 text-cyan-400" />
                </div>
                <CardTitle className="text-xl">{t('logs.trace')}</CardTitle>
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
            <div className="min-w-[200px]">
              <ProjectPicker projectId={projectId} onChange={setProjectId} />
            </div>

            {/* Trace Type Selector */}
            <div className="space-y-2">
              <label className="block text-sm text-muted-foreground">Trace Type</label>
              <div className="flex flex-wrap gap-2">
                {traceTypeOptions.map((option) => {
                  const Icon = option.icon;
                  const isSelected = traceType === option.value;
                  return (
                    <button
                      key={option.value}
                      onClick={() => setTraceType(option.value)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all ${
                        isSelected
                          ? 'bg-cyan-500/15 border-cyan-500/30 text-cyan-400'
                          : 'bg-card/50 border-white/10 text-muted-foreground hover:bg-white/5 hover:border-white/20'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span className="text-sm font-medium">{option.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Search Input */}
            <div className="flex flex-wrap gap-4 items-end">
              <div className="flex-1 min-w-[280px]">
                <label className="block text-sm text-muted-foreground mb-1.5">Value</label>
                <div className="relative">
                  <selectedTypeOption.icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    value={traceValue}
                    onChange={(e) => setTraceValue(e.target.value)}
                    placeholder={selectedTypeOption.placeholder}
                    className="pl-10 bg-card/50"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void trace();
                    }}
                  />
                </div>
              </div>

              {(traceType === 'deviceMac' || traceType === 'deviceSn') && (
                <>
                  <div className="flex-1 min-w-[180px]">
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
                  <div className="flex-1 min-w-[180px]">
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
                </>
              )}

              <Button
                disabled={!projectId || !traceValue.trim() || loading}
                onClick={() => void trace()}
                className="gap-2"
              >
                <Search className={`w-4 h-4 ${loading ? 'animate-pulse' : ''}`} />
                {loading ? t('common.loading') : t('logs.trace')}
              </Button>
            </div>

            {result && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Activity className="w-4 h-4" />
                {t('common.items', { count: result.count })}
              </div>
            )}

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
        {loading && !result && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
          >
            <Card className="glass">
              <CardContent className="p-6">
                <div className="flex gap-4">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-20 flex-1" />
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card className="glass">
              <CardContent className="p-6 space-y-4">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-24 w-full" />
                ))}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Related Devices (for linkCode trace) */}
      <AnimatePresence>
        {relatedDevices.length > 0 && (
          <motion.div variants={staggerItem} initial="hidden" animate="visible" exit="hidden">
            <Card className="glass">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-2">
                  <Bluetooth className="w-4 h-4 text-muted-foreground" />
                  <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                    {t('logs.trace.relatedDevices')}
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {relatedDevices.map((device, index) => (
                    <motion.div
                      key={device.deviceMac}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: 0.05 * index }}
                    >
                      <button
                        onClick={() => {
                          setTraceType('deviceMac');
                          setTraceValue(device.deviceMac);
                        }}
                        className="w-full p-4 rounded-xl bg-card/50 border border-white/10 hover:border-cyan-500/30 hover:bg-cyan-500/5 transition-all text-left group"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <code className="text-sm font-semibold text-foreground/90">
                            {device.deviceMac}
                          </code>
                          <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-cyan-400 transition-colors" />
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Activity className="w-3 h-3" />
                            {device.eventCount} events
                          </span>
                        </div>
                        {device.firstSeenMs && device.lastSeenMs && (
                          <div className="mt-2 text-xs text-muted-foreground/70 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {new Date(device.firstSeenMs).toLocaleString(localeTag)} ~{' '}
                            {new Date(device.lastSeenMs).toLocaleString(localeTag)}
                          </div>
                        )}
                      </button>
                    </motion.div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Related Sessions (for deviceMac trace) */}
      <AnimatePresence>
        {relatedSessions.length > 0 && (
          <motion.div variants={staggerItem} initial="hidden" animate="visible" exit="hidden">
            <Card className="glass">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-2">
                  <Link2 className="w-4 h-4 text-muted-foreground" />
                  <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                    {t('logs.trace.relatedSessions')}
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {relatedSessions.map((session, index) => (
                    <motion.div
                      key={session.linkCode}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: 0.05 * index }}
                    >
                      <button
                        onClick={() => {
                          setTraceType('linkCode');
                          setTraceValue(session.linkCode);
                        }}
                        className="w-full p-4 rounded-xl bg-card/50 border border-white/10 hover:border-violet-500/30 hover:bg-violet-500/5 transition-all text-left group"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <code className="text-sm font-semibold text-foreground/90">
                            {session.linkCode}
                          </code>
                          <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-violet-400 transition-colors" />
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Activity className="w-3 h-3" />
                            {session.eventCount} events
                          </span>
                        </div>
                        {session.startTimeMs && session.endTimeMs && (
                          <div className="mt-2 text-xs text-muted-foreground/70 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {new Date(session.startTimeMs).toLocaleString(localeTag)} ~{' '}
                            {new Date(session.endTimeMs).toLocaleString(localeTag)}
                          </div>
                        )}
                      </button>
                    </motion.div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Relation Loading */}
      <AnimatePresence>
        {relationLoading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Card className="glass">
              <CardContent className="py-8 text-center text-muted-foreground">
                {t('common.loading')}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Timeline */}
      <AnimatePresence>
        {result && result.items.length > 0 && (
          <motion.div variants={staggerItem} initial="hidden" animate="visible" exit="hidden">
            <Card className="glass">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                    Timeline
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="relative pl-6">
                  {/* Timeline line */}
                  <div className="absolute left-2 top-0 bottom-0 w-0.5 bg-gradient-to-b from-cyan-500/50 via-violet-500/50 to-transparent rounded-full" />

                  <div className="space-y-4">
                    {result.items.map((item, index) => {
                      const config = getLevelConfig(item.level);
                      return (
                        <motion.div
                          key={item.id}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ duration: 0.4, delay: 0.05 * index }}
                          className="relative"
                        >
                          {/* Timeline dot */}
                          <div
                            className={`absolute -left-6 top-4 w-3 h-3 rounded-full ${config.dotClass} ring-2 ring-background shadow-lg`}
                            style={{ boxShadow: `0 0 8px ${config.dotClass.includes('red') ? 'rgba(239,68,68,0.4)' : config.dotClass.includes('amber') ? 'rgba(245,158,11,0.4)' : 'transparent'}` }}
                          />

                          <div
                            className={`p-4 rounded-xl ${config.bgClass} border ${config.borderClass} hover:scale-[1.01] transition-transform`}
                          >
                            <div className="flex flex-wrap items-center gap-2 mb-3">
                              <Badge
                                variant="outline"
                                className={`${config.color} border-current text-xs`}
                              >
                                {config.label}
                              </Badge>
                              <span className="font-semibold text-foreground/90">
                                {item.eventName}
                              </span>
                              <span className="text-xs text-muted-foreground flex items-center gap-1 ml-auto">
                                <Clock className="w-3 h-3" />
                                {new Date(item.timestampMs).toLocaleString(localeTag)}
                              </span>
                            </div>

                            {item.msg && (
                              <p className="text-sm text-muted-foreground mb-3 leading-relaxed">
                                {item.msg}
                              </p>
                            )}

                            <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
                              {item.deviceMac && (
                                <span className="flex items-center gap-1.5 text-foreground/70">
                                  <Bluetooth className="w-3 h-3" />
                                  <span className="font-medium">Device:</span> {item.deviceMac}
                                </span>
                              )}
                              {item.deviceSn && (
                                <span className="flex items-center gap-1.5 text-foreground/70">
                                  <Tag className="w-3 h-3" />
                                  <span className="font-medium">SN:</span> {item.deviceSn}
                                </span>
                              )}
                              {item.linkCode && (
                                <span className="flex items-center gap-1.5 text-foreground/70">
                                  <Link2 className="w-3 h-3" />
                                  <span className="font-medium">Link:</span> {item.linkCode}
                                </span>
                              )}
                              {item.requestId && (
                                <span className="flex items-center gap-1.5 text-foreground/70">
                                  <Hash className="w-3 h-3" />
                                  <span className="font-medium">ReqID:</span> {item.requestId}
                                </span>
                              )}
                              {item.errorCode && (
                                <span className="flex items-center gap-1.5 text-red-400">
                                  <AlertCircle className="w-3 h-3" />
                                  <span className="font-medium">Error:</span> {item.errorCode}
                                </span>
                              )}
                              {item.threadName && (
                                <span className="flex items-center gap-1.5 text-muted-foreground">
                                  <Server className="w-3 h-3" />
                                  Thread: {item.threadName}
                                </span>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Empty State */}
      <AnimatePresence>
        {result && result.items.length === 0 && (
          <motion.div variants={fadeIn} initial="hidden" animate="visible" exit="hidden">
            <Card className="glass">
              <CardContent className="py-12 text-center">
                <Search className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                <p className="text-muted-foreground">{t('logs.empty')}</p>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
