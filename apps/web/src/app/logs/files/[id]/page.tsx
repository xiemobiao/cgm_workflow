'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import shellStyles from '@/components/AppShell.module.css';
import formStyles from '@/components/Form.module.css';
import { ApiClientError, apiFetch } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

type LogFileDetail = {
  id: string;
  fileName: string;
  status: 'queued' | 'parsed' | 'failed';
  parserVersion: string | null;
  uploadedAt: string;
  eventCount: number;
  errorCount: number;
  minTimestampMs: number | null;
  maxTimestampMs: number | null;
};

export default function LogFileDetailPage() {
  const { localeTag, t } = useI18n();
  const params = useParams();
  const fileId = typeof params.id === 'string' ? params.id : '';

  const [detail, setDetail] = useState<LogFileDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!fileId) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    setDetail(null);
    apiFetch<LogFileDetail>(`/api/logs/files/${fileId}`)
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
    return () => {
      cancelled = true;
    };
  }, [fileId]);

  const logsHref = useMemo(() => {
    if (!fileId) return '/logs';
    const qs = new URLSearchParams({ logFileId: fileId });
    if (detail && detail.minTimestampMs !== null && detail.maxTimestampMs !== null) {
      qs.set('startMs', String(detail.minTimestampMs));
      qs.set('endMs', String(detail.maxTimestampMs));
    }
    return `/logs?${qs.toString()}`;
  }, [detail?.maxTimestampMs, detail?.minTimestampMs, fileId]);

  return (
    <div className={shellStyles.grid}>
      <div className={shellStyles.card}>
        <div className={formStyles.row} style={{ justifyContent: 'space-between' }}>
          <h1 style={{ fontSize: 20, marginBottom: 0 }}>{t('logs.files.detail.title')}</h1>
          <div className={formStyles.row}>
            <Link href="/logs/files" className={shellStyles.button}>
              {t('common.back')}
            </Link>
            <Link href={logsHref} className={shellStyles.button}>
              {t('logs.files.openInLogs')}
            </Link>
          </div>
        </div>

        {loading ? <div className={formStyles.muted}>{t('common.loading')}</div> : null}
        {error ? <div className={formStyles.error}>{error}</div> : null}

        {detail ? (
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
        ) : null}
      </div>
    </div>
  );
}
