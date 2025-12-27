'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState, type CSSProperties } from 'react';
import { motion } from 'framer-motion';
import { Activity, AlertTriangle, BarChart3, FileText, Clock, Database, Bluetooth, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ApiClientError, apiFetch } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { setActiveLogFileId } from '@/lib/log-file-scope';

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
  tracking: {
    deviceSn: { eventCount: number; distinctCount: number; top: Array<{ value: string; count: number }> };
    deviceMac: { eventCount: number; distinctCount: number; top: Array<{ value: string; count: number }> };
    linkCode: { eventCount: number; distinctCount: number; top: Array<{ value: string; count: number }> };
  };
};

type BleQualityItemStatus = 'ok' | 'missing' | 'level_mismatch' | 'name_mismatch';

type BleQualityItem = {
  category: string;
  description: string;
  eventName: string;
  expectedLevel: 1 | 2 | 3 | 4;
  expectedLevelLabel: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  status: BleQualityItemStatus;
  totalCount: number;
  expectedLevelCount: number;
  countsByLevel: Record<'1' | '2' | '3' | '4', number>;
  matchedEventNames?: string[];
};

type BleQualityReport = {
  logFileId: string;
  summary: {
    requiredTotal: number;
    okTotal: number;
    missingTotal: number;
    levelMismatchTotal: number;
    nameMismatchTotal: number;
    coverageRatio: number;
  };
  byCategory: Array<{
    category: string;
    requiredTotal: number;
    okTotal: number;
    missingTotal: number;
    levelMismatchTotal: number;
    nameMismatchTotal: number;
  }>;
  requiredEvents: BleQualityItem[];
  pairChecks: Array<{
    name: string;
    startEventName: string;
    endEventNames: string[];
    startCount: number;
    endCount: number;
    pendingCount: number;
  }>;
  parser: {
    parserErrorCount: number;
    logan: { blocksTotal: number; blocksSucceeded: number; blocksFailed: number } | null;
  };
};

type BleQualityTab = 'missing' | 'levelMismatch' | 'nameMismatch' | 'pairChecks';

type BackendQualityReport = {
  logFileId: string;
  summary: {
    http: {
      total: number;
      success: number;
      failed: number;
      missingEnd: number;
      tookMsAvg: number | null;
      tookMsP95: number | null;
    };
	    mqtt: {
	      uploadBatchSent: number;
	      uploadSkippedNotConnected: number;
	      publishSuccess: number;
	      publishFailed: number;
	      ackSuccess: number;
	      ackFailed: number;
	      ackTimeout: number;
	      subscribeFailed: number;
	      issuesMissingDeviceSn: number;
	      disconnected: number;
	      connected: number;
	    };
	  };
  http: {
    endpoints: Array<{ method: string | null; path: string; total: number; success: number; failed: number }>;
    failedRequests: Array<{
      requestId: string;
      timestampMs: number;
      method: string | null;
      url: string | null;
      statusCode: number | null;
      tookMs: number | null;
    }>;
    missingEndRequests: Array<{
      requestId: string;
      startTimestampMs: number;
      method: string | null;
      url: string | null;
    }>;
  };
  mqtt: {
    issuesByDevice: Array<{
      deviceSn: string;
      uploadSkippedNotConnected: number;
      publishFailed: number;
      ackFailed: number;
      ackTimeout: number;
    }>;
    ackTimeouts: Array<{ timestampMs: number; deviceSn: string | null; msgId: string | null; message: string }>;
    publishFailures: Array<{
      timestampMs: number;
      deviceSn: string | null;
      msgId: string | null;
      topic: string | null;
      message: string;
    }>;
  };
};

export default function LogFileDetailPage() {
  const { localeTag, t } = useI18n();
  const router = useRouter();
  const params = useParams();
  const fileId = typeof params.id === 'string' ? params.id : '';

  const [detail, setDetail] = useState<LogFileDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [bleQuality, setBleQuality] = useState<BleQualityReport | null>(null);
  const [bleLoading, setBleLoading] = useState(false);
  const [bleError, setBleError] = useState('');
  const [bleTab, setBleTab] = useState<BleQualityTab>('missing');
  const [bleTabInitialized, setBleTabInitialized] = useState(false);
  const [bleAdvanced, setBleAdvanced] = useState(false);
  const [backendQuality, setBackendQuality] = useState<BackendQualityReport | null>(null);
  const [backendLoading, setBackendLoading] = useState(false);
  const [backendError, setBackendError] = useState('');
  const [backendDetails, setBackendDetails] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    if (!fileId) return;
    let cancelled = false;
    const id = window.setTimeout(() => {
      if (cancelled) return;
      setLoading(true);
      setBleLoading(true);
      setBackendLoading(true);
      setError('');
      setBleError('');
      setBackendError('');
      setDetail(null);
      setBleQuality(null);
      setBackendQuality(null);
      setBleTabInitialized(false);
      setBackendDetails(false);
      apiFetch<LogFileDetail>(`/api/logs/files/${fileId}`)
        .then((data) => {
          if (cancelled) return;
          setDetail(data);
          setActiveLogFileId(data.projectId, fileId);
        })
        .catch((e: unknown) => {
          if (cancelled) return;
          const msg =
            e instanceof ApiClientError ? `${e.code}: ${e.message}` : String(e);
          setError(msg);
        })
        .finally(() => {
          if (cancelled) return;
          setLoading(false);
        });

      apiFetch<BleQualityReport>(`/api/logs/files/${fileId}/ble-quality`)
        .then((data) => {
          if (cancelled) return;
          setBleQuality(data);
        })
        .catch((e: unknown) => {
          if (cancelled) return;
          const msg =
            e instanceof ApiClientError ? `${e.code}: ${e.message}` : String(e);
          setBleError(msg);
        })
        .finally(() => {
          if (cancelled) return;
          setBleLoading(false);
        });

      apiFetch<BackendQualityReport>(`/api/logs/files/${fileId}/backend-quality`)
        .then((data) => {
          if (cancelled) return;
          setBackendQuality(data);
        })
        .catch((e: unknown) => {
          if (cancelled) return;
          const msg =
            e instanceof ApiClientError ? `${e.code}: ${e.message}` : String(e);
          setBackendError(msg);
        })
        .finally(() => {
          if (cancelled) return;
          setBackendLoading(false);
        });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [fileId]);

  const logsHref = (() => {
    if (!fileId) return '/logs';
    const qs = new URLSearchParams({ logFileId: fileId });
    if (detail && detail.minTimestampMs !== null && detail.maxTimestampMs !== null) {
      qs.set('startMs', String(detail.minTimestampMs));
      qs.set('endMs', String(detail.maxTimestampMs));
    }
    return `/logs?${qs.toString()}`;
  })();

  const makeLogsHref = (extra: Record<string, string>) => {
    if (!fileId) return '/logs';
    const qs = new URLSearchParams({ logFileId: fileId, ...extra });
    if (detail && detail.minTimestampMs !== null && detail.maxTimestampMs !== null) {
      qs.set('startMs', String(detail.minTimestampMs));
      qs.set('endMs', String(detail.maxTimestampMs));
    }
    return `/logs?${qs.toString()}`;
  };

  const makeTraceHref = (type: 'deviceSn' | 'deviceMac' | 'linkCode', value: string) => {
    if (!fileId || !detail?.projectId || !value.trim()) return '/logs/trace';
    const qs = new URLSearchParams({
      projectId: detail.projectId,
      logFileId: fileId,
      type,
      value: value.trim(),
      auto: '1',
    });
    if (detail.minTimestampMs !== null && detail.maxTimestampMs !== null) {
      qs.set('startTime', new Date(detail.minTimestampMs).toISOString());
      qs.set('endTime', new Date(detail.maxTimestampMs).toISOString());
    }
    return `/logs/trace?${qs.toString()}`;
  };

  const traceOverviewHref = (() => {
    if (!fileId || !detail?.projectId) return '/logs/trace';
    const qs = new URLSearchParams({
      projectId: detail.projectId,
      logFileId: fileId,
    });
    if (detail.minTimestampMs !== null && detail.maxTimestampMs !== null) {
      qs.set('startTime', new Date(detail.minTimestampMs).toISOString());
      qs.set('endTime', new Date(detail.maxTimestampMs).toISOString());
    }
    return `/logs/trace?${qs.toString()}`;
  })();

  const trackingCoveragePercent = (hitCount: number) => {
    const total = detail?.eventCount ?? 0;
    if (total <= 0) return 0;
    return Math.round((hitCount / total) * 100);
  };

  const missingItems =
    bleQuality?.requiredEvents.filter((e) => e.status === 'missing') ?? [];
  const levelMismatchItems =
    bleQuality?.requiredEvents.filter((e) => e.status === 'level_mismatch') ?? [];
  const nameMismatchItems =
    bleQuality?.requiredEvents.filter((e) => e.status === 'name_mismatch') ?? [];
  const pendingPairs = bleQuality?.pairChecks.filter((p) => p.pendingCount > 0) ?? [];
  const advancedIssueCount = levelMismatchItems.length + nameMismatchItems.length;
  const backendIssueCount = backendQuality
    ? backendQuality.summary.http.failed +
      backendQuality.summary.http.missingEnd +
      backendQuality.summary.mqtt.uploadSkippedNotConnected +
      backendQuality.summary.mqtt.publishFailed +
      backendQuality.summary.mqtt.ackFailed +
      backendQuality.summary.mqtt.ackTimeout +
      backendQuality.summary.mqtt.subscribeFailed
    : 0;

  useEffect(() => {
    if (bleAdvanced) return;
    if (bleTab === 'levelMismatch' || bleTab === 'nameMismatch') setBleTab('missing');
  }, [bleAdvanced, bleTab]);

  useEffect(() => {
    if (!bleQuality) return;
    if (bleTabInitialized) return;

    const pendingTotal = bleQuality.pairChecks.filter((p) => p.pendingCount > 0).length;
    const first: BleQualityTab =
      bleQuality.summary.missingTotal > 0
        ? 'missing'
        : pendingTotal > 0
          ? 'pairChecks'
          : bleAdvanced && bleQuality.summary.levelMismatchTotal > 0
            ? 'levelMismatch'
            : bleAdvanced && bleQuality.summary.nameMismatchTotal > 0
              ? 'nameMismatch'
              : 'missing';

    setBleTab(first);
    setBleTabInitialized(true);
  }, [bleQuality, bleTabInitialized, bleAdvanced]);

  const levelBadge = (label: BleQualityItem['expectedLevelLabel']) => {
    if (label === 'ERROR') {
      return <Badge variant="destructive">{label}</Badge>;
    }

    if (label === 'WARN') {
      return <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20">{label}</Badge>;
    }

    if (label === 'INFO') {
      return <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20">{label}</Badge>;
    }

    return <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">{label}</Badge>;
  };

  return (
    <div className="space-y-6 p-6">
      {/* 页面头部 */}
      <Card className="glass">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-2xl font-bold">{t('logs.files.detail.title')}</CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link href="/logs/files">{t('common.back')}</Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/logs/files/${fileId}/viewer`}>{t('logs.files.viewContent')}</Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/logs/files/${fileId}/event-flow`}>事件流分析</Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link href={logsHref}>{t('logs.files.openInLogs')}</Link>
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={deleting || loading || !fileId}
                onClick={() => {
                  const name = detail?.fileName ?? fileId;
                  const ok = window.confirm(t('logs.files.deleteConfirm', { fileName: name }));
                  if (!ok) return;
                  setDeleting(true);
                  setDeleteError('');
                  apiFetch<{ deleted: boolean }>(`/api/logs/files/${fileId}`, { method: 'DELETE' })
                    .then(() => {
                      router.push('/logs/files');
                    })
                    .catch((e: unknown) => {
                      const msg = e instanceof ApiClientError ? `${e.code}: ${e.message}` : String(e);
                      setDeleteError(msg);
                    })
                    .finally(() => setDeleting(false));
                }}
              >
                {t('logs.files.delete')}
              </Button>
            </div>
          </div>
        </CardHeader>
        {loading && (
          <CardContent>
            <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
          </CardContent>
        )}
        {error && (
          <CardContent>
            <p className="text-sm text-red-400">{error}</p>
          </CardContent>
        )}
        {deleteError && (
          <CardContent>
            <p className="text-sm text-red-400">{deleteError}</p>
          </CardContent>
        )}
      </Card>

      {detail ? (
        <>
          {/* 概览仪表盘 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* 事件总数卡片 */}
            <Card className="glass">
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border border-blue-500/30">
                    <Activity className="w-6 h-6 text-blue-400" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-muted-foreground">事件总数</p>
                    <p className="text-3xl font-semibold tabular-nums">{detail.eventCount.toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 错误数量卡片 */}
            <Card className="glass">
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-gradient-to-br from-red-500/20 to-orange-500/20 border border-red-500/30">
                    <AlertTriangle className="w-6 h-6 text-red-400" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-muted-foreground">错误数量</p>
                    <p className="text-3xl font-semibold tabular-nums">{detail.errorCount.toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 质量评分卡片 */}
            <Card className="glass">
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-gradient-to-br from-emerald-500/20 to-green-500/20 border border-emerald-500/30">
                    <BarChart3 className="w-6 h-6 text-emerald-400" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-muted-foreground">BLE 质量覆盖率</p>
                    <p className="text-3xl font-semibold tabular-nums">
                      {bleQuality ? `${Math.round(bleQuality.summary.coverageRatio * 100)}%` : '-'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 文件基本信息卡片 */}
          <Card className="glass">
            <CardHeader>
              <CardTitle className="text-base font-medium uppercase tracking-wider text-muted-foreground">
                文件信息
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium text-muted-foreground w-1/3">{t('logs.files.fileName')}</TableCell>
                    <TableCell>{detail.fileName}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium text-muted-foreground w-1/3">{t('logs.files.status')}</TableCell>
                    <TableCell>
                      <Badge variant={detail.status === 'failed' ? 'destructive' : 'secondary'}>
                        {t(`logs.fileStatus.${detail.status}`)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium text-muted-foreground w-1/3">{t('logs.files.uploadedAt')}</TableCell>
                    <TableCell>{new Date(detail.uploadedAt).toLocaleString(localeTag)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium text-muted-foreground w-1/3">parserVersion</TableCell>
                    <TableCell>{detail.parserVersion ?? '-'}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium text-muted-foreground w-1/3">{t('logs.files.events')}</TableCell>
                    <TableCell className="font-semibold tabular-nums">{detail.eventCount.toLocaleString()}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium text-muted-foreground w-1/3">{t('logs.files.errors')}</TableCell>
                    <TableCell className="font-semibold tabular-nums">{detail.errorCount.toLocaleString()}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium text-muted-foreground w-1/3">{t('logs.files.timeRange')}</TableCell>
                    <TableCell>
                      {detail.minTimestampMs !== null && detail.maxTimestampMs !== null
                        ? `${new Date(detail.minTimestampMs).toLocaleString(localeTag)} ~ ${new Date(detail.maxTimestampMs).toLocaleString(localeTag)}`
                        : t('logs.files.timeRangeUnknown')}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium text-muted-foreground w-1/3">{t('table.id')}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{detail.id}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Tracking 数据卡片 */}
          <Card className="glass">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-medium uppercase tracking-wider text-muted-foreground">
                  {t('logs.files.tracking.title')}
                </CardTitle>
                <Button variant="outline" size="sm" asChild>
                  <Link href={traceOverviewHref}>{t('logs.trace')}</Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Device SN */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium">{t('logs.files.tracking.deviceSn')}</h4>
                  <span className="text-xs text-muted-foreground">
                    {t('logs.files.tracking.stats', {
                      events: String(detail.tracking.deviceSn.eventCount),
                      distinct: String(detail.tracking.deviceSn.distinctCount),
                    })}
                  </span>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">覆盖率</span>
                    <span className="font-semibold tabular-nums">
                      {trackingCoveragePercent(detail.tracking.deviceSn.eventCount)}%
                    </span>
                  </div>
                  <Progress value={trackingCoveragePercent(detail.tracking.deviceSn.eventCount)} className="h-2" />
                </div>
                {detail.tracking.deviceSn.top.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {detail.tracking.deviceSn.top.map((item) => (
                      <Badge key={`sn:${item.value}`} variant="secondary">
                        <Link href={makeTraceHref('deviceSn', item.value)} className="cursor-pointer hover:bg-secondary/80">
                          SN:{item.value} ({item.count})
                        </Link>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {/* Device MAC */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium">{t('logs.files.tracking.deviceMac')}</h4>
                  <span className="text-xs text-muted-foreground">
                    {t('logs.files.tracking.stats', {
                      events: String(detail.tracking.deviceMac.eventCount),
                      distinct: String(detail.tracking.deviceMac.distinctCount),
                    })}
                  </span>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">覆盖率</span>
                    <span className="font-semibold tabular-nums">
                      {trackingCoveragePercent(detail.tracking.deviceMac.eventCount)}%
                    </span>
                  </div>
                  <Progress value={trackingCoveragePercent(detail.tracking.deviceMac.eventCount)} className="h-2" />
                </div>
                {detail.tracking.deviceMac.top.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {detail.tracking.deviceMac.top.map((item) => (
                      <Badge key={`mac:${item.value}`} variant="secondary">
                        <Link href={makeTraceHref('deviceMac', item.value)} className="cursor-pointer hover:bg-secondary/80">
                          MAC:{item.value} ({item.count})
                        </Link>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {/* Link Code */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium">{t('logs.files.tracking.linkCode')}</h4>
                  <span className="text-xs text-muted-foreground">
                    {t('logs.files.tracking.stats', {
                      events: String(detail.tracking.linkCode.eventCount),
                      distinct: String(detail.tracking.linkCode.distinctCount),
                    })}
                  </span>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">覆盖率</span>
                    <span className="font-semibold tabular-nums">
                      {trackingCoveragePercent(detail.tracking.linkCode.eventCount)}%
                    </span>
                  </div>
                  <Progress value={trackingCoveragePercent(detail.tracking.linkCode.eventCount)} className="h-2" />
                </div>
                {detail.tracking.linkCode.top.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {detail.tracking.linkCode.top.map((item) => (
                      <Badge key={`lc:${item.value}`} variant="secondary">
                        <Link href={makeTraceHref('linkCode', item.value)} className="cursor-pointer hover:bg-secondary/80">
                          {item.value} ({item.count})
                        </Link>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}

      {/* 后端质量报告卡片 */}
      <Card className="glass">
        <CardHeader>
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-medium uppercase tracking-wider text-muted-foreground">
                {t('logs.files.backendQuality.title')}
              </CardTitle>
              <div className="flex items-center gap-2 flex-wrap">
                <Button variant="outline" size="sm" asChild>
                  <Link href={makeLogsHref({})}>{t('logs.files.openInLogs')}</Link>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <Link href={makeLogsHref({ eventName: 'network_request_failed' })}>
                    {t('logs.files.backendQuality.viewHttpFailed')}
                  </Link>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <Link href={makeLogsHref({ msgContains: 'ACK超时' })}>
                    {t('logs.files.backendQuality.viewAckTimeouts')}
                  </Link>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <Link href={makeLogsHref({ msgContains: 'MQTT_PUBLISH_FAILED' })}>
                    {t('logs.files.backendQuality.viewMqttPublishFailed')}
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setBackendDetails((v) => !v)}
                  title={t('logs.files.backendQuality.hint')}
                >
                  {backendDetails
                    ? t('logs.files.backendQuality.hideDetails')
                    : t('logs.files.backendQuality.showDetails')}
                  {!backendDetails && backendIssueCount > 0 ? ` (${backendIssueCount})` : null}
                </Button>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">{t('logs.files.backendQuality.hint')}</p>
          </div>
        </CardHeader>

        {backendLoading && (
          <CardContent>
            <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
          </CardContent>
        )}
        {backendError && (
          <CardContent>
            <p className="text-sm text-red-400">{backendError}</p>
          </CardContent>
        )}

        {backendQuality && (
          <CardContent className="space-y-6">
            {/* HTTP 统计 */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <Database className="w-4 h-4" />
                HTTP
              </h4>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">
                  {t('logs.files.backendQuality.httpTotal')}:{backendQuality.summary.http.total}
                </Badge>
                <Badge className={backendQuality.summary.http.success > 0 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : ''}>
                  {t('logs.files.backendQuality.httpOk')}:{backendQuality.summary.http.success}
                </Badge>
                <Badge variant={backendQuality.summary.http.failed > 0 ? 'destructive' : 'secondary'}>
                  {t('logs.files.backendQuality.httpFail')}:{backendQuality.summary.http.failed}
                </Badge>
                <Badge className={backendQuality.summary.http.missingEnd > 0 ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : ''}>
                  {t('logs.files.backendQuality.httpOpen')}:{backendQuality.summary.http.missingEnd}
                </Badge>
                <Badge variant="secondary">
                  {t('logs.files.backendQuality.httpAvg')}:
                  {backendQuality.summary.http.tookMsAvg ? Math.round(backendQuality.summary.http.tookMsAvg) : '-'}ms
                </Badge>
                <Badge variant="secondary">
                  {t('logs.files.backendQuality.httpP95')}:
                  {backendQuality.summary.http.tookMsP95 ? Math.round(backendQuality.summary.http.tookMsP95) : '-'}ms
                </Badge>
              </div>
            </div>

            {/* MQTT 统计 */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                MQTT
              </h4>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">
                  {t('logs.files.backendQuality.uploadBatchSent')}:{backendQuality.summary.mqtt.uploadBatchSent}
                </Badge>
                <Badge className={backendQuality.summary.mqtt.publishSuccess > 0 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : ''}>
                  {t('logs.files.backendQuality.publishOk')}:{backendQuality.summary.mqtt.publishSuccess}
                </Badge>
                <Badge variant={backendQuality.summary.mqtt.publishFailed > 0 ? 'destructive' : 'secondary'}>
                  {t('logs.files.backendQuality.publishFail')}:{backendQuality.summary.mqtt.publishFailed}
                </Badge>
                <Badge className={backendQuality.summary.mqtt.ackSuccess > 0 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : ''}>
                  {t('logs.files.backendQuality.ackOk')}:{backendQuality.summary.mqtt.ackSuccess}
                </Badge>
                <Badge className={backendQuality.summary.mqtt.ackFailed > 0 ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : ''}>
                  {t('logs.files.backendQuality.ackFail')}:{backendQuality.summary.mqtt.ackFailed}
                </Badge>
                <Badge variant={backendQuality.summary.mqtt.ackTimeout > 0 ? 'destructive' : 'secondary'}>
                  {t('logs.files.backendQuality.ackTimeout')}:{backendQuality.summary.mqtt.ackTimeout}
                </Badge>
                <Badge className={backendQuality.summary.mqtt.uploadSkippedNotConnected > 0 ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : ''}>
                  {t('logs.files.backendQuality.notConnected')}:{backendQuality.summary.mqtt.uploadSkippedNotConnected}
                </Badge>
                <Badge variant={backendQuality.summary.mqtt.subscribeFailed > 0 ? 'destructive' : 'secondary'}>
                  {t('logs.files.backendQuality.subscribeFail')}:{backendQuality.summary.mqtt.subscribeFailed}
                </Badge>
                <Badge
                  variant={backendQuality.summary.mqtt.issuesMissingDeviceSn > 0 ? 'destructive' : 'secondary'}
                  title={t('logs.files.backendQuality.snMissingHint')}
                >
                  {t('logs.files.backendQuality.snMissing')}:{backendQuality.summary.mqtt.issuesMissingDeviceSn}
                </Badge>
              </div>
            </div>

            {/* HTTP 端点详情表格 */}
            {backendDetails && backendQuality.http.endpoints.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">{t('logs.files.backendQuality.httpTop')}</p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('logs.files.backendQuality.httpPath')}</TableHead>
                      <TableHead className="w-32">{t('logs.files.backendQuality.httpOk')}</TableHead>
                      <TableHead className="w-32">{t('logs.files.backendQuality.httpFail')}</TableHead>
                      <TableHead className="w-32">{t('logs.files.backendQuality.httpTotal')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {backendQuality.http.endpoints.map((row) => (
                      <TableRow key={`${row.method ?? 'NA'}:${row.path}`}>
                        <TableCell className="font-mono text-xs">
                          {row.method ? `${row.method} ` : ''}
                          {row.path}
                        </TableCell>
                        <TableCell>{row.success}</TableCell>
                        <TableCell>{row.failed}</TableCell>
                        <TableCell>{row.total}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* MQTT 设备问题详情表格 */}
            {backendDetails && backendQuality.mqtt.issuesByDevice.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">{t('logs.files.backendQuality.mqttDeviceTop')}</p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('logs.files.backendQuality.deviceSn')}</TableHead>
                      <TableHead className="w-32">{t('logs.files.backendQuality.ackTimeout')}</TableHead>
                      <TableHead className="w-32">{t('logs.files.backendQuality.ackFail')}</TableHead>
                      <TableHead className="w-32">{t('logs.files.backendQuality.publishFail')}</TableHead>
                      <TableHead className="w-32">{t('logs.files.backendQuality.notConnected')}</TableHead>
                      <TableHead className="w-36">{t('table.actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {backendQuality.mqtt.issuesByDevice.map((row) => (
                      <TableRow key={row.deviceSn}>
                        <TableCell className="font-mono text-xs">{row.deviceSn}</TableCell>
                        <TableCell>{row.ackTimeout}</TableCell>
                        <TableCell>{row.ackFailed}</TableCell>
                        <TableCell>{row.publishFailed}</TableCell>
                        <TableCell>{row.uploadSkippedNotConnected}</TableCell>
                        <TableCell>
                          <Button variant="outline" size="sm" asChild>
                            <Link href={makeTraceHref('deviceSn', row.deviceSn)}>
                              {t('logs.files.backendQuality.traceSn')}
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* BLE 质量报告卡片 */}
      <Card className="glass">
        <CardHeader>
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Bluetooth className="w-4 h-4" />
                {t('logs.files.bleQuality.title')}
              </CardTitle>
              <div className="flex items-center gap-2 flex-wrap">
                <Button variant="outline" size="sm" asChild>
                  <Link href={makeLogsHref({})}>{t('logs.files.openInLogs')}</Link>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <Link href={makeLogsHref({ eventName: 'PARSER_ERROR' })}>
                    {t('logs.files.bleQuality.viewParserErrors')}
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setBleAdvanced((v) => !v)}
                  title={t('logs.files.bleQuality.hint')}
                >
                  {bleAdvanced
                    ? t('logs.files.bleQuality.hideAdvanced')
                    : t('logs.files.bleQuality.showAdvanced')}
                  {!bleAdvanced && advancedIssueCount > 0 ? ` (${advancedIssueCount})` : null}
                </Button>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">{t('logs.files.bleQuality.hint')}</p>
          </div>
        </CardHeader>

        {bleLoading && (
          <CardContent>
            <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
          </CardContent>
        )}
        {bleError && (
          <CardContent>
            <p className="text-sm text-red-400">{bleError}</p>
          </CardContent>
        )}

        {bleQuality ? (
          <>
            {(() => {
              const coveragePercent = Math.round(bleQuality.summary.coverageRatio * 100);
              const progressColor =
                coveragePercent >= 80
                  ? 'rgba(96, 255, 166, 0.85)'
                  : coveragePercent >= 40
                    ? 'rgba(245, 158, 11, 0.85)'
                    : 'rgba(255, 107, 107, 0.85)';

              const tabItems: Array<{ key: BleQualityTab; label: string; count: number }> = [
                { key: 'missing', label: t('logs.files.bleQuality.tab.missing'), count: missingItems.length },
                ...(bleAdvanced
                  ? [
                      {
                        key: 'levelMismatch' as const,
                        label: t('logs.files.bleQuality.tab.levelMismatch'),
                        count: levelMismatchItems.length,
                      },
                      {
                        key: 'nameMismatch' as const,
                        label: t('logs.files.bleQuality.tab.nameMismatch'),
                        count: nameMismatchItems.length,
                      },
                    ]
                  : []),
                { key: 'pairChecks', label: t('logs.files.bleQuality.tab.pairChecks'), count: pendingPairs.length },
              ];

              const tabButton = (tab: (typeof tabItems)[number]) => {
                const active = bleTab === tab.key;
                const disabled = tab.count === 0;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    className=""
                    disabled={disabled}
                    onClick={() => setBleTab(tab.key)}
                    style={{
                      cursor: disabled ? 'not-allowed' : 'pointer',
                      opacity: disabled ? 0.55 : 1,
                      borderColor: active ? 'rgba(124, 92, 255, 0.55)' : undefined,
                      background: active ? 'rgba(124, 92, 255, 0.16)' : undefined,
                    }}
                  >
                    <span>{tab.label}</span>
                    <span style={{ fontWeight: 600 }}>{tab.count}</span>
                  </button>
                );
              };

              const renderMissing = () => {
                if (missingItems.length === 0) {
                  return <div className="text-sm text-muted-foreground">{t('logs.files.bleQuality.emptySection')}</div>;
                }
                return (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('logs.files.bleQuality.table.eventName')}</TableHead>
                        <TableHead>{t('logs.files.bleQuality.table.description')}</TableHead>
                        <TableHead className="w-32">{t('logs.files.bleQuality.table.expectedLevel')}</TableHead>
                        <TableHead className="w-40">{t('logs.files.bleQuality.table.category')}</TableHead>
                        <TableHead className="w-32">{t('logs.files.bleQuality.table.actions')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {missingItems.map((e) => (
                        <TableRow key={`${e.category}:${e.eventName}`}>
                          <TableCell className="font-mono text-xs">{e.eventName}</TableCell>
                          <TableCell>{e.description}</TableCell>
                          <TableCell>{levelBadge(e.expectedLevelLabel)}</TableCell>
                          <TableCell>{e.category}</TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm" asChild>
                              <Link href={makeLogsHref({ eventName: e.eventName })}>
                                {t('logs.files.bleQuality.openInLogs')}
                              </Link>
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                );
              };

              const renderLevelMismatch = () => {
                if (levelMismatchItems.length === 0) {
                  return <div className="text-sm text-muted-foreground">{t('logs.files.bleQuality.emptySection')}</div>;
                }
                return (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('logs.files.bleQuality.table.eventName')}</TableHead>
                        <TableHead>{t('logs.files.bleQuality.table.description')}</TableHead>
                        <TableHead className="w-32">{t('logs.files.bleQuality.table.expectedLevel')}</TableHead>
                        <TableHead>{t('logs.files.bleQuality.table.counts')}</TableHead>
                        <TableHead className="w-32">{t('logs.files.bleQuality.table.actions')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {levelMismatchItems.map((e) => (
                        <TableRow key={`${e.category}:${e.eventName}`}>
                          <TableCell className="font-mono text-xs">{e.eventName}</TableCell>
                          <TableCell>{e.description}</TableCell>
                          <TableCell>{levelBadge(e.expectedLevelLabel)}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            DEBUG:{e.countsByLevel['1']} INFO:{e.countsByLevel['2']} WARN:
                            {e.countsByLevel['3']} ERROR:{e.countsByLevel['4']}
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm" asChild>
                              <Link href={makeLogsHref({ eventName: e.eventName })}>
                                {t('logs.files.bleQuality.openInLogs')}
                              </Link>
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                );
              };

              const renderNameMismatch = () => {
                if (nameMismatchItems.length === 0) {
                  return <div className="text-sm text-muted-foreground">{t('logs.files.bleQuality.emptySection')}</div>;
                }
                return (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-48">{t('logs.files.bleQuality.table.eventName')}</TableHead>
                        <TableHead>{t('logs.files.bleQuality.table.description')}</TableHead>
                        <TableHead className="w-80">{t('logs.files.bleQuality.table.matchedEventNames')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {nameMismatchItems.map((e) => (
                        <TableRow key={`${e.category}:${e.eventName}`}>
                          <TableCell className="font-mono text-xs">{e.eventName}</TableCell>
                          <TableCell>{e.description}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-2">
                              {(e.matchedEventNames ?? []).map((n) => (
                                <Button key={n} variant="ghost" size="sm" asChild>
                                  <Link href={makeLogsHref({ eventName: n })}>
                                    <code className="text-xs">{n}</code>
                                  </Link>
                                </Button>
                              ))}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                );
              };

              const renderPairChecks = () => {
                if (pendingPairs.length === 0) {
                  return <div className="text-sm text-muted-foreground">{t('logs.files.bleQuality.emptySection')}</div>;
                }
                return (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-40">{t('logs.files.bleQuality.table.flow')}</TableHead>
                        <TableHead className="w-48">{t('logs.files.bleQuality.table.eventName')}</TableHead>
                        <TableHead>{t('logs.files.bleQuality.table.endEventNames')}</TableHead>
                        <TableHead className="w-32">{t('logs.files.bleQuality.table.pendingCount')}</TableHead>
                        <TableHead className="w-32">{t('logs.files.bleQuality.table.actions')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pendingPairs.map((p) => (
                        <TableRow key={`${p.name}:${p.startEventName}`}>
                          <TableCell className="font-medium">{p.name}</TableCell>
                          <TableCell className="font-mono text-xs">{p.startEventName}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-2">
                              {p.endEventNames.map((n) => (
                                <code key={n} className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                  {n}
                                </code>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">{p.pendingCount}</Badge>
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm" asChild>
                              <Link href={makeLogsHref({ eventName: p.startEventName })}>
                                {t('logs.files.bleQuality.openInLogs')}
                              </Link>
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                );
              };

              const renderTabBody = () => {
                const visible = new Set(tabItems.map((t) => t.key));
                const active = visible.has(bleTab) ? bleTab : 'missing';
                switch (active) {
                  case 'missing':
                    return renderMissing();
                  case 'levelMismatch':
                    return renderLevelMismatch();
                  case 'nameMismatch':
                    return renderNameMismatch();
                  case 'pairChecks':
                    return renderPairChecks();
                }
              };

              return (
                <>
                  <div style={{ marginTop: 14 }}>
                    <div className="text-sm font-medium">{t('logs.files.bleQuality.coverage')}</div>
                    <div className="text-sm text-muted-foreground" style={{ marginTop: 6 }}>
                      {bleQuality.summary.okTotal}/{bleQuality.summary.requiredTotal} ({coveragePercent}%)
                    </div>
                    <div
                      style={{
                        marginTop: 10,
                        height: 8,
                        borderRadius: 999,
                        background: 'rgba(255, 255, 255, 0.08)',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${coveragePercent}%`,
                          height: '100%',
                          background: progressColor,
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    <Badge
                      variant={bleQuality.summary.missingTotal > 0 ? 'destructive' : 'secondary'}
                      title={t('logs.files.bleQuality.missing')}
                    >
                      {t('logs.files.bleQuality.missing')}: {bleQuality.summary.missingTotal}
                    </Badge>
                    {bleAdvanced ? (
                      <>
                        <Badge
                          className={bleQuality.summary.levelMismatchTotal > 0 ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : ''}
                          title={t('logs.files.bleQuality.levelMismatch')}
                        >
                          {t('logs.files.bleQuality.levelMismatch')}: {bleQuality.summary.levelMismatchTotal}
                        </Badge>
                        <Badge
                          className={bleQuality.summary.nameMismatchTotal > 0 ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' : ''}
                          title={t('logs.files.bleQuality.nameMismatch')}
                        >
                          {t('logs.files.bleQuality.nameMismatch')}: {bleQuality.summary.nameMismatchTotal}
                        </Badge>
                      </>
                    ) : null}
                    <Badge
                      variant={bleQuality.parser.parserErrorCount > 0 ? 'destructive' : 'secondary'}
                      title={t('logs.files.bleQuality.parserErrors')}
                    >
                      {t('logs.files.bleQuality.parserErrors')}: {bleQuality.parser.parserErrorCount}
                    </Badge>
                    <Badge
                      className={(bleQuality.parser.logan?.blocksFailed ?? 0) > 0 ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : ''}
                      title={t('logs.files.bleQuality.logan')}
                    >
                      {t('logs.files.bleQuality.logan')}:{' '}
                      {bleQuality.parser.logan
                        ? `${bleQuality.parser.logan.blocksFailed}/${bleQuality.parser.logan.blocksTotal} ${t('logs.files.bleQuality.loganFailedBlocks')}`
                        : '-'}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-2" style={{ marginTop: 14 }}>
                    {tabItems.map(tabButton)}
                  </div>

                  <div style={{ marginTop: 10 }}>{renderTabBody()}</div>
                </>
              );
            })()}
          </>
        ) : null}
      </Card>
    </div>
  );
}
