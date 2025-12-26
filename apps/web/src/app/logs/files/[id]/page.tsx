'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState, type CSSProperties } from 'react';
import shellStyles from '@/components/AppShell.module.css';
import formStyles from '@/components/Form.module.css';
import { ApiClientError, apiFetch } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

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
    if (!detail?.projectId || !value.trim()) return '/logs/trace';
    const qs = new URLSearchParams({
      projectId: detail.projectId,
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
    const base: CSSProperties = {
      borderColor: undefined,
      background: undefined,
      color: undefined,
    };

    if (label === 'ERROR') return <span className={`${shellStyles.badge} ${shellStyles.badgeDanger}`}>{label}</span>;

    if (label === 'WARN') {
      base.borderColor = 'rgba(245, 158, 11, 0.35)';
      base.background = 'rgba(245, 158, 11, 0.12)';
      base.color = 'rgba(255, 242, 204, 0.95)';
    } else if (label === 'INFO') {
      base.borderColor = 'rgba(59, 130, 246, 0.35)';
      base.background = 'rgba(59, 130, 246, 0.12)';
      base.color = 'rgba(208, 230, 255, 0.95)';
    } else {
      base.borderColor = 'rgba(34, 197, 94, 0.35)';
      base.background = 'rgba(34, 197, 94, 0.12)';
      base.color = 'rgba(200, 255, 220, 0.95)';
    }

    return (
      <span className={shellStyles.badge} style={base}>
        {label}
      </span>
    );
  };

  return (
    <div className={`${shellStyles.grid} ${shellStyles.grid2}`}>
      <div className={shellStyles.card}>
        <div className={formStyles.row} style={{ justifyContent: 'space-between' }}>
          <h1 style={{ fontSize: 20, marginBottom: 0 }}>{t('logs.files.detail.title')}</h1>
          <div className={formStyles.row}>
            <Link href="/logs/files" className={shellStyles.button}>
              {t('common.back')}
            </Link>
            <Link href={`/logs/files/${fileId}/viewer`} className={shellStyles.button}>
              {t('logs.files.viewContent')}
            </Link>
            <Link href={logsHref} className={shellStyles.button}>
              {t('logs.files.openInLogs')}
            </Link>
            <button
              className={`${shellStyles.button} ${shellStyles.buttonDanger}`}
              type="button"
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
            </button>
          </div>
        </div>

        {loading ? <div className={formStyles.muted}>{t('common.loading')}</div> : null}
        {error ? <div className={formStyles.error}>{error}</div> : null}
        {deleteError ? <div className={formStyles.error}>{deleteError}</div> : null}

        {detail ? (
          <>
            <div className={shellStyles.kvGrid} style={{ marginTop: 14 }}>
              <div className={shellStyles.kvKey}>{t('logs.files.fileName')}</div>
              <div className={shellStyles.kvValue}>{detail.fileName}</div>

              <div className={shellStyles.kvKey}>{t('logs.files.status')}</div>
              <div className={shellStyles.kvValue}>
                <span
                  className={`${shellStyles.badge}${detail.status === 'failed' ? ` ${shellStyles.badgeDanger}` : ''}`}
                >
                  {t(`logs.fileStatus.${detail.status}`)}
                </span>
              </div>

              <div className={shellStyles.kvKey}>{t('logs.files.uploadedAt')}</div>
              <div className={shellStyles.kvValue}>
                {new Date(detail.uploadedAt).toLocaleString(localeTag)}
              </div>

              <div className={shellStyles.kvKey}>parserVersion</div>
              <div className={shellStyles.kvValue}>{detail.parserVersion ?? '-'}</div>

              <div className={shellStyles.kvKey}>{t('logs.files.events')}</div>
              <div className={shellStyles.kvValue}>{detail.eventCount}</div>

              <div className={shellStyles.kvKey}>{t('logs.files.errors')}</div>
              <div className={shellStyles.kvValue}>{detail.errorCount}</div>

              <div className={shellStyles.kvKey}>{t('logs.files.timeRange')}</div>
              <div className={shellStyles.kvValue}>
                {detail.minTimestampMs !== null && detail.maxTimestampMs !== null
                  ? `${new Date(detail.minTimestampMs).toLocaleString(localeTag)} ~ ${new Date(detail.maxTimestampMs).toLocaleString(localeTag)}`
                  : t('logs.files.timeRangeUnknown')}
              </div>

              <div className={shellStyles.kvKey}>{t('table.id')}</div>
              <div className={shellStyles.kvValue}>{detail.id}</div>
            </div>

            <div style={{ marginTop: 14 }}>
              <div className={formStyles.row} style={{ justifyContent: 'space-between' }}>
                <div className={formStyles.muted}>{t('logs.files.tracking.title')}</div>
                <Link href="/logs/trace" className={shellStyles.button}>
                  {t('logs.trace')}
                </Link>
              </div>

              <div className={shellStyles.kvGrid} style={{ marginTop: 10 }}>
                <div className={shellStyles.kvKey}>{t('logs.files.tracking.deviceSn')}</div>
                <div className={shellStyles.kvValue}>
                  <span className={formStyles.muted}>
                    {t('logs.files.tracking.stats', {
                      events: String(detail.tracking.deviceSn.eventCount),
                      distinct: String(detail.tracking.deviceSn.distinctCount),
                    })}{' '}
                    ·{' '}
                    {t('logs.files.tracking.coverage', {
                      percent: String(
                        trackingCoveragePercent(detail.tracking.deviceSn.eventCount),
                      ),
                    })}
                  </span>
                  {detail.tracking.deviceSn.top.length ? (
                    <div className={formStyles.row} style={{ marginTop: 6, flexWrap: 'wrap' }}>
                      {detail.tracking.deviceSn.top.map((item) => (
                        <Link
                          key={`sn:${item.value}`}
                          href={makeTraceHref('deviceSn', item.value)}
                          className={shellStyles.badge}
                          style={{ textDecoration: 'none' }}
                        >
                          SN:{item.value} ({item.count})
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className={shellStyles.kvKey}>{t('logs.files.tracking.deviceMac')}</div>
                <div className={shellStyles.kvValue}>
                  <span className={formStyles.muted}>
                    {t('logs.files.tracking.stats', {
                      events: String(detail.tracking.deviceMac.eventCount),
                      distinct: String(detail.tracking.deviceMac.distinctCount),
                    })}{' '}
                    ·{' '}
                    {t('logs.files.tracking.coverage', {
                      percent: String(
                        trackingCoveragePercent(detail.tracking.deviceMac.eventCount),
                      ),
                    })}
                  </span>
                  {detail.tracking.deviceMac.top.length ? (
                    <div className={formStyles.row} style={{ marginTop: 6, flexWrap: 'wrap' }}>
                      {detail.tracking.deviceMac.top.map((item) => (
                        <Link
                          key={`mac:${item.value}`}
                          href={makeTraceHref('deviceMac', item.value)}
                          className={shellStyles.badge}
                          style={{ textDecoration: 'none' }}
                        >
                          MAC:{item.value} ({item.count})
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className={shellStyles.kvKey}>{t('logs.files.tracking.linkCode')}</div>
                <div className={shellStyles.kvValue}>
                  <span className={formStyles.muted}>
                    {t('logs.files.tracking.stats', {
                      events: String(detail.tracking.linkCode.eventCount),
                      distinct: String(detail.tracking.linkCode.distinctCount),
                    })}{' '}
                    ·{' '}
                    {t('logs.files.tracking.coverage', {
                      percent: String(
                        trackingCoveragePercent(detail.tracking.linkCode.eventCount),
                      ),
                    })}
                  </span>
                  {detail.tracking.linkCode.top.length ? (
                    <div className={formStyles.row} style={{ marginTop: 6, flexWrap: 'wrap' }}>
                      {detail.tracking.linkCode.top.map((item) => (
                        <Link
                          key={`lc:${item.value}`}
                          href={makeTraceHref('linkCode', item.value)}
                          className={shellStyles.badge}
                          style={{ textDecoration: 'none' }}
                        >
                          {item.value} ({item.count})
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </>
        ) : null}
      </div>

      <div className={shellStyles.card}>
        <div className={formStyles.row} style={{ justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: 16, marginBottom: 0 }}>{t('logs.files.backendQuality.title')}</h2>
          <div className={formStyles.row}>
            <Link href={makeLogsHref({})} className={shellStyles.button}>
              {t('logs.files.openInLogs')}
            </Link>
            <Link href={makeLogsHref({ eventName: 'network_request_failed' })} className={shellStyles.button}>
              {t('logs.files.backendQuality.viewHttpFailed')}
            </Link>
            <Link href={makeLogsHref({ msgContains: 'ACK超时' })} className={shellStyles.button}>
              {t('logs.files.backendQuality.viewAckTimeouts')}
            </Link>
            <Link href={makeLogsHref({ msgContains: 'MQTT_PUBLISH_FAILED' })} className={shellStyles.button}>
              {t('logs.files.backendQuality.viewMqttPublishFailed')}
            </Link>
            <button
              type="button"
              className={shellStyles.button}
              onClick={() => setBackendDetails((v) => !v)}
              title={t('logs.files.backendQuality.hint')}
            >
              {backendDetails
                ? t('logs.files.backendQuality.hideDetails')
                : t('logs.files.backendQuality.showDetails')}
              {!backendDetails && backendIssueCount > 0 ? ` (${backendIssueCount})` : null}
            </button>
          </div>
        </div>

        <div className={formStyles.muted} style={{ marginTop: 8 }}>
          {t('logs.files.backendQuality.hint')}
        </div>

        {backendLoading ? <div className={formStyles.muted}>{t('common.loading')}</div> : null}
        {backendError ? <div className={formStyles.error}>{backendError}</div> : null}

        {backendQuality ? (
          <>
	            <div className={shellStyles.kvGrid} style={{ marginTop: 14 }}>
	              <div className={shellStyles.kvKey}>HTTP</div>
	              <div className={shellStyles.kvValue}>
	                <span className={shellStyles.badge}>
	                  {t('logs.files.backendQuality.httpTotal')}:{backendQuality.summary.http.total}
	                </span>{' '}
	                <span
	                  className={shellStyles.badge}
	                  style={
	                    backendQuality.summary.http.success > 0
	                      ? { borderColor: 'rgba(34, 197, 94, 0.35)' }
	                      : undefined
	                  }
	                >
	                  {t('logs.files.backendQuality.httpOk')}:{backendQuality.summary.http.success}
	                </span>{' '}
	                <span
	                  className={`${shellStyles.badge}${backendQuality.summary.http.failed > 0 ? ` ${shellStyles.badgeDanger}` : ''}`}
	                >
	                  {t('logs.files.backendQuality.httpFail')}:{backendQuality.summary.http.failed}
	                </span>{' '}
	                <span
	                  className={shellStyles.badge}
	                  style={
	                    backendQuality.summary.http.missingEnd > 0
	                      ? {
	                          borderColor: 'rgba(245, 158, 11, 0.35)',
	                          background: 'rgba(245, 158, 11, 0.12)',
	                        }
	                      : undefined
	                  }
	                >
	                  {t('logs.files.backendQuality.httpOpen')}:{backendQuality.summary.http.missingEnd}
	                </span>{' '}
	                <span className={shellStyles.badge}>
	                  {t('logs.files.backendQuality.httpAvg')}:
	                  {backendQuality.summary.http.tookMsAvg ? Math.round(backendQuality.summary.http.tookMsAvg) : '-'}ms
	                </span>{' '}
	                <span className={shellStyles.badge}>
	                  {t('logs.files.backendQuality.httpP95')}:
	                  {backendQuality.summary.http.tookMsP95 ? Math.round(backendQuality.summary.http.tookMsP95) : '-'}ms
	                </span>
	              </div>

	              <div className={shellStyles.kvKey}>MQTT</div>
	              <div className={shellStyles.kvValue}>
	                <span className={shellStyles.badge}>
	                  {t('logs.files.backendQuality.uploadBatchSent')}:{backendQuality.summary.mqtt.uploadBatchSent}
	                </span>{' '}
	                <span
	                  className={shellStyles.badge}
	                  style={
	                    backendQuality.summary.mqtt.publishSuccess > 0
	                      ? { borderColor: 'rgba(34, 197, 94, 0.35)' }
	                      : undefined
	                  }
	                >
	                  {t('logs.files.backendQuality.publishOk')}:{backendQuality.summary.mqtt.publishSuccess}
	                </span>{' '}
	                <span
	                  className={`${shellStyles.badge}${backendQuality.summary.mqtt.publishFailed > 0 ? ` ${shellStyles.badgeDanger}` : ''}`}
	                >
	                  {t('logs.files.backendQuality.publishFail')}:{backendQuality.summary.mqtt.publishFailed}
	                </span>{' '}
	                <span
	                  className={shellStyles.badge}
	                  style={
	                    backendQuality.summary.mqtt.ackSuccess > 0
	                      ? { borderColor: 'rgba(34, 197, 94, 0.35)' }
	                      : undefined
	                  }
	                >
	                  {t('logs.files.backendQuality.ackOk')}:{backendQuality.summary.mqtt.ackSuccess}
	                </span>{' '}
	                <span
	                  className={shellStyles.badge}
	                  style={
	                    backendQuality.summary.mqtt.ackFailed > 0
	                      ? {
	                          borderColor: 'rgba(245, 158, 11, 0.35)',
	                          background: 'rgba(245, 158, 11, 0.12)',
	                        }
	                      : undefined
	                  }
	                >
	                  {t('logs.files.backendQuality.ackFail')}:{backendQuality.summary.mqtt.ackFailed}
	                </span>{' '}
	                <span
	                  className={`${shellStyles.badge}${backendQuality.summary.mqtt.ackTimeout > 0 ? ` ${shellStyles.badgeDanger}` : ''}`}
	                >
	                  {t('logs.files.backendQuality.ackTimeout')}:{backendQuality.summary.mqtt.ackTimeout}
	                </span>{' '}
	                <span
	                  className={shellStyles.badge}
	                  style={
	                    backendQuality.summary.mqtt.uploadSkippedNotConnected > 0
	                      ? {
	                          borderColor: 'rgba(245, 158, 11, 0.35)',
	                          background: 'rgba(245, 158, 11, 0.12)',
	                        }
	                      : undefined
	                  }
	                >
	                  {t('logs.files.backendQuality.notConnected')}:{backendQuality.summary.mqtt.uploadSkippedNotConnected}
	                </span>{' '}
	                <span
	                  className={`${shellStyles.badge}${backendQuality.summary.mqtt.subscribeFailed > 0 ? ` ${shellStyles.badgeDanger}` : ''}`}
	                >
	                  {t('logs.files.backendQuality.subscribeFail')}:{backendQuality.summary.mqtt.subscribeFailed}
	                </span>{' '}
	                <span
	                  className={`${shellStyles.badge}${backendQuality.summary.mqtt.issuesMissingDeviceSn > 0 ? ` ${shellStyles.badgeDanger}` : ''}`}
	                  title={t('logs.files.backendQuality.snMissingHint')}
	                >
	                  {t('logs.files.backendQuality.snMissing')}:{backendQuality.summary.mqtt.issuesMissingDeviceSn}
	                </span>
	              </div>
	            </div>

            {backendDetails && backendQuality.http.endpoints.length ? (
              <div style={{ marginTop: 14 }}>
                <div className={formStyles.muted} style={{ marginBottom: 8 }}>
                  {t('logs.files.backendQuality.httpTop')}
                </div>
                <div className={shellStyles.tableWrap}>
                  <table className={shellStyles.table}>
                    <thead>
                      <tr>
                        <th>{t('logs.files.backendQuality.httpPath')}</th>
                        <th style={{ width: 120 }}>{t('logs.files.backendQuality.httpOk')}</th>
                        <th style={{ width: 120 }}>{t('logs.files.backendQuality.httpFail')}</th>
                        <th style={{ width: 120 }}>{t('logs.files.backendQuality.httpTotal')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {backendQuality.http.endpoints.map((row) => (
                        <tr key={`${row.method ?? 'NA'}:${row.path}`}>
                          <td className={shellStyles.mono}>
                            {row.method ? `${row.method} ` : ''}
                            {row.path}
                          </td>
                          <td>{row.success}</td>
                          <td>{row.failed}</td>
                          <td>{row.total}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {backendDetails && backendQuality.mqtt.issuesByDevice.length ? (
              <div style={{ marginTop: 14 }}>
                <div className={formStyles.muted} style={{ marginBottom: 8 }}>
                  {t('logs.files.backendQuality.mqttDeviceTop')}
                </div>
                <div className={shellStyles.tableWrap}>
                  <table className={shellStyles.table}>
                    <thead>
                      <tr>
                        <th>{t('logs.files.backendQuality.deviceSn')}</th>
                        <th style={{ width: 120 }}>{t('logs.files.backendQuality.ackTimeout')}</th>
                        <th style={{ width: 120 }}>{t('logs.files.backendQuality.ackFail')}</th>
                        <th style={{ width: 120 }}>{t('logs.files.backendQuality.publishFail')}</th>
                        <th style={{ width: 120 }}>{t('logs.files.backendQuality.notConnected')}</th>
                        <th style={{ width: 140 }}>{t('table.actions')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {backendQuality.mqtt.issuesByDevice.map((row) => (
                        <tr key={row.deviceSn}>
                          <td className={shellStyles.mono}>{row.deviceSn}</td>
                          <td>{row.ackTimeout}</td>
                          <td>{row.ackFailed}</td>
                          <td>{row.publishFailed}</td>
                          <td>{row.uploadSkippedNotConnected}</td>
                          <td>
                            <Link href={makeTraceHref('deviceSn', row.deviceSn)} className={shellStyles.button}>
                              {t('logs.files.backendQuality.traceSn')}
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      <div className={shellStyles.card}>
        <div className={formStyles.row} style={{ justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: 16, marginBottom: 0 }}>{t('logs.files.bleQuality.title')}</h2>
          <div className={formStyles.row}>
            <Link href={makeLogsHref({})} className={shellStyles.button}>
              {t('logs.files.openInLogs')}
            </Link>
            <Link href={makeLogsHref({ eventName: 'PARSER_ERROR' })} className={shellStyles.button}>
              {t('logs.files.bleQuality.viewParserErrors')}
            </Link>
            <button
              type="button"
              className={shellStyles.button}
              onClick={() => setBleAdvanced((v) => !v)}
              title={t('logs.files.bleQuality.hint')}
            >
              {bleAdvanced
                ? t('logs.files.bleQuality.hideAdvanced')
                : t('logs.files.bleQuality.showAdvanced')}
              {!bleAdvanced && advancedIssueCount > 0 ? ` (${advancedIssueCount})` : null}
            </button>
          </div>
        </div>

        <div className={formStyles.muted} style={{ marginTop: 8 }}>
          {t('logs.files.bleQuality.hint')}
        </div>

        {bleLoading ? <div className={formStyles.muted}>{t('common.loading')}</div> : null}
        {bleError ? <div className={formStyles.error}>{bleError}</div> : null}

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
                    className={shellStyles.badge}
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
                  return <div className={formStyles.muted}>{t('logs.files.bleQuality.emptySection')}</div>;
                }
                return (
                  <div className={shellStyles.tableWrap}>
                    <table className={shellStyles.table}>
                      <thead>
                        <tr>
                          <th>{t('logs.files.bleQuality.table.eventName')}</th>
                          <th>{t('logs.files.bleQuality.table.description')}</th>
                          <th>{t('logs.files.bleQuality.table.expectedLevel')}</th>
                          <th>{t('logs.files.bleQuality.table.category')}</th>
                          <th>{t('logs.files.bleQuality.table.actions')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {missingItems.map((e) => (
                          <tr key={`${e.category}:${e.eventName}`}>
                            <td>
                              <code>{e.eventName}</code>
                            </td>
                            <td>{e.description}</td>
                            <td>{levelBadge(e.expectedLevelLabel)}</td>
                            <td>{e.category}</td>
                            <td>
                              <Link
                                href={makeLogsHref({ eventName: e.eventName })}
                                className={shellStyles.badge}
                                style={{ cursor: 'pointer' }}
                              >
                                {t('logs.files.bleQuality.openInLogs')}
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              };

              const renderLevelMismatch = () => {
                if (levelMismatchItems.length === 0) {
                  return <div className={formStyles.muted}>{t('logs.files.bleQuality.emptySection')}</div>;
                }
                return (
                  <div className={shellStyles.tableWrap}>
                    <table className={shellStyles.table}>
                      <thead>
                        <tr>
                          <th>{t('logs.files.bleQuality.table.eventName')}</th>
                          <th>{t('logs.files.bleQuality.table.description')}</th>
                          <th>{t('logs.files.bleQuality.table.expectedLevel')}</th>
                          <th>{t('logs.files.bleQuality.table.counts')}</th>
                          <th>{t('logs.files.bleQuality.table.actions')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {levelMismatchItems.map((e) => (
                          <tr key={`${e.category}:${e.eventName}`}>
                            <td>
                              <code>{e.eventName}</code>
                            </td>
                            <td>{e.description}</td>
                            <td>{levelBadge(e.expectedLevelLabel)}</td>
                            <td className={formStyles.muted}>
                              DEBUG:{e.countsByLevel['1']} INFO:{e.countsByLevel['2']} WARN:
                              {e.countsByLevel['3']} ERROR:{e.countsByLevel['4']}
                            </td>
                            <td>
                              <Link
                                href={makeLogsHref({ eventName: e.eventName })}
                                className={shellStyles.badge}
                                style={{ cursor: 'pointer' }}
                              >
                                {t('logs.files.bleQuality.openInLogs')}
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              };

              const renderNameMismatch = () => {
                if (nameMismatchItems.length === 0) {
                  return <div className={formStyles.muted}>{t('logs.files.bleQuality.emptySection')}</div>;
                }
                return (
                  <div className={shellStyles.tableWrap}>
                    <table className={shellStyles.table}>
                      <thead>
                        <tr>
                          <th>{t('logs.files.bleQuality.table.eventName')}</th>
                          <th>{t('logs.files.bleQuality.table.description')}</th>
                          <th>{t('logs.files.bleQuality.table.matchedEventNames')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {nameMismatchItems.map((e) => (
                          <tr key={`${e.category}:${e.eventName}`}>
                            <td>
                              <code>{e.eventName}</code>
                            </td>
                            <td>{e.description}</td>
                            <td>
                              {(e.matchedEventNames ?? []).map((n) => (
                                <Link
                                  key={n}
                                  href={makeLogsHref({ eventName: n })}
                                  style={{ marginRight: 10 }}
                                >
                                  <code>{n}</code>
                                </Link>
                              ))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              };

              const renderPairChecks = () => {
                if (pendingPairs.length === 0) {
                  return <div className={formStyles.muted}>{t('logs.files.bleQuality.emptySection')}</div>;
                }
                return (
                  <div className={shellStyles.tableWrap}>
                    <table className={shellStyles.table}>
                      <thead>
                        <tr>
                          <th>{t('logs.files.bleQuality.table.flow')}</th>
                          <th>{t('logs.files.bleQuality.table.eventName')}</th>
                          <th>{t('logs.files.bleQuality.table.endEventNames')}</th>
                          <th>{t('logs.files.bleQuality.table.pendingCount')}</th>
                          <th>{t('logs.files.bleQuality.table.actions')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pendingPairs.map((p) => (
                          <tr key={`${p.name}:${p.startEventName}`}>
                            <td>{p.name}</td>
                            <td>
                              <code>{p.startEventName}</code>
                            </td>
                            <td className={formStyles.muted}>
                              {p.endEventNames.map((n) => (
                                <code key={n} style={{ marginRight: 10 }}>
                                  {n}
                                </code>
                              ))}
                            </td>
                            <td>
                              <span className={`${shellStyles.badge} ${shellStyles.badgeDanger}`}>
                                {p.pendingCount}
                              </span>
                            </td>
                            <td>
                              <Link
                                href={makeLogsHref({ eventName: p.startEventName })}
                                className={shellStyles.badge}
                                style={{ cursor: 'pointer' }}
                              >
                                {t('logs.files.bleQuality.openInLogs')}
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
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
                    <div className={formStyles.label}>{t('logs.files.bleQuality.coverage')}</div>
                    <div className={formStyles.muted} style={{ marginTop: 6 }}>
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
                    <span
                      className={`${shellStyles.badge}${bleQuality.summary.missingTotal > 0 ? ` ${shellStyles.badgeDanger}` : ''}`}
                      title={t('logs.files.bleQuality.missing')}
                    >
                      {t('logs.files.bleQuality.missing')}: {bleQuality.summary.missingTotal}
                    </span>
                    {bleAdvanced ? (
                      <>
                        <span
                          className={shellStyles.badge}
                          style={{
                            borderColor:
                              bleQuality.summary.levelMismatchTotal > 0
                                ? 'rgba(245, 158, 11, 0.35)'
                                : undefined,
                            background:
                              bleQuality.summary.levelMismatchTotal > 0
                                ? 'rgba(245, 158, 11, 0.12)'
                                : undefined,
                          }}
                          title={t('logs.files.bleQuality.levelMismatch')}
                        >
                          {t('logs.files.bleQuality.levelMismatch')}: {bleQuality.summary.levelMismatchTotal}
                        </span>
                        <span
                          className={shellStyles.badge}
                          style={{
                            borderColor:
                              bleQuality.summary.nameMismatchTotal > 0
                                ? 'rgba(124, 92, 255, 0.42)'
                                : undefined,
                            background:
                              bleQuality.summary.nameMismatchTotal > 0
                                ? 'rgba(124, 92, 255, 0.12)'
                                : undefined,
                          }}
                          title={t('logs.files.bleQuality.nameMismatch')}
                        >
                          {t('logs.files.bleQuality.nameMismatch')}: {bleQuality.summary.nameMismatchTotal}
                        </span>
                      </>
                    ) : null}
                    <span
                      className={`${shellStyles.badge}${bleQuality.parser.parserErrorCount > 0 ? ` ${shellStyles.badgeDanger}` : ''}`}
                      title={t('logs.files.bleQuality.parserErrors')}
                    >
                      {t('logs.files.bleQuality.parserErrors')}: {bleQuality.parser.parserErrorCount}
                    </span>
                    <span
                      className={shellStyles.badge}
                      style={{
                        borderColor:
                          (bleQuality.parser.logan?.blocksFailed ?? 0) > 0
                            ? 'rgba(245, 158, 11, 0.35)'
                            : undefined,
                        background:
                          (bleQuality.parser.logan?.blocksFailed ?? 0) > 0
                            ? 'rgba(245, 158, 11, 0.12)'
                            : undefined,
                      }}
                      title={t('logs.files.bleQuality.logan')}
                    >
                      {t('logs.files.bleQuality.logan')}:{' '}
                      {bleQuality.parser.logan
                        ? `${bleQuality.parser.logan.blocksFailed}/${bleQuality.parser.logan.blocksTotal} ${t('logs.files.bleQuality.loganFailedBlocks')}`
                        : '-'}
                    </span>
                  </div>

                  <div className={formStyles.row} style={{ marginTop: 14 }}>
                    {tabItems.map(tabButton)}
                  </div>

                  <div style={{ marginTop: 10 }}>{renderTabBody()}</div>
                </>
              );
            })()}
          </>
        ) : null}
      </div>
    </div>
  );
}
