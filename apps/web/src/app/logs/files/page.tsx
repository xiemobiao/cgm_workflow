'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import shellStyles from '@/components/AppShell.module.css';
import formStyles from '@/components/Form.module.css';
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
};

type ListResponse = { items: LogFileItem[]; nextCursor: string | null };

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

  useEffect(() => {
    if (!projectId) return;
    void load(true);
  }, [projectId]);

  return (
    <div className={shellStyles.grid}>
      <div className={shellStyles.card}>
        <div className={formStyles.row} style={{ justifyContent: 'space-between' }}>
          <h1 style={{ fontSize: 20, marginBottom: 0 }}>{t('logs.files.title')}</h1>
          <Link href="/logs" className={shellStyles.button}>
            {t('logs.files.backToLogs')}
          </Link>
        </div>

        <div className={formStyles.row} style={{ marginTop: 10 }}>
          <ProjectPicker projectId={projectId} onChange={setProjectId} />
          <div className={formStyles.field} style={{ minWidth: 140 }}>
            <div className={formStyles.label}>{t('logs.limit')}</div>
            <input
              className={formStyles.input}
              type="number"
              min={1}
              max={100}
              value={limit}
              onChange={(e) => {
                const n = e.currentTarget.valueAsNumber;
                if (!Number.isFinite(n)) return;
                setLimit(Math.min(Math.max(Math.trunc(n), 1), 100));
              }}
            />
          </div>
          <button
            className={shellStyles.button}
            type="button"
            disabled={!canLoad || loading}
            onClick={() => void load(true)}
          >
            {t('common.refresh')}
          </button>
          <button
            className={shellStyles.button}
            type="button"
            disabled={!canLoad || loading || !nextCursor}
            onClick={() => void load(false)}
          >
            {t('common.loadMore')}
          </button>
          <div className={formStyles.muted}>
            {loading ? t('common.loading') : t('common.items', { count: items.length })}
          </div>
        </div>

        {error ? <div className={formStyles.error}>{error}</div> : null}
      </div>

      <div className={shellStyles.card}>
        <div className={shellStyles.tableWrap}>
          <table className={shellStyles.table}>
            <thead>
              <tr>
                <th>{t('logs.files.uploadedAt')}</th>
                <th>{t('logs.files.fileName')}</th>
                <th>{t('logs.files.status')}</th>
                <th>{t('logs.files.events')}</th>
                <th>{t('logs.files.errors')}</th>
                <th>{t('table.id')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((f) => (
                <tr
                  key={f.id}
                  className={shellStyles.clickableRow}
                  onClick={() => router.push(`/logs/files/${f.id}`)}
                >
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {new Date(f.uploadedAt).toLocaleString(localeTag)}
                  </td>
                  <td style={{ minWidth: 260 }}>{f.fileName}</td>
                  <td>
                    <span
                      className={`${shellStyles.badge}${f.status === 'failed' ? ` ${shellStyles.badgeDanger}` : ''}`}
                    >
                      {t(`logs.fileStatus.${f.status}`)}
                    </span>
                  </td>
                  <td>{f.eventCount}</td>
                  <td>{f.errorCount}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <span className={formStyles.muted}>{f.id}</span>
                  </td>
                </tr>
              ))}
              {items.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: 10 }} className={formStyles.muted}>
                    {t('logs.files.empty')}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

