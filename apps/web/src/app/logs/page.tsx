'use client';

import { useEffect, useMemo, useState } from 'react';
import shellStyles from '@/components/AppShell.module.css';
import formStyles from '@/components/Form.module.css';
import { ProjectPicker } from '@/components/ProjectPicker';
import { ApiClientError, apiFetch } from '@/lib/api';
import { API_BASE_URL } from '@/lib/config';
import { getProjectId, getToken } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';

type UploadResponse = { logFileId: string; status: string };
type SearchItem = {
  id: string;
  eventName: string;
  level: number;
  timestampMs: number;
  sdkVersion: string | null;
  appId: string | null;
  logFileId: string;
};
type SearchResponse = { items: SearchItem[]; nextCursor: string | null };

function toIsoFromDatetimeLocal(value: string) {
  const d = new Date(value);
  return d.toISOString();
}

function formatDatetimeLocal(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function LogsPage() {
  const { localeTag, t } = useI18n();
  const [projectId, setProjectId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploadResult, setUploadResult] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [eventName, setEventName] = useState('');
  const [startLocal, setStartLocal] = useState('');
  const [endLocal, setEndLocal] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [results, setResults] = useState<SearchItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setProjectId(getProjectId() ?? '');
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  const canSearch = useMemo(() => Boolean(projectId), [projectId]);

  useEffect(() => {
    const now = new Date();
    setEndLocal(formatDatetimeLocal(now));
    setStartLocal(formatDatetimeLocal(new Date(now.getTime() - 24 * 60 * 60 * 1000)));
  }, []);

  function setPresetRange(hours: number) {
    const now = new Date();
    setEndLocal(formatDatetimeLocal(now));
    setStartLocal(formatDatetimeLocal(new Date(now.getTime() - hours * 60 * 60 * 1000)));
  }

  async function upload() {
    if (!projectId || !file) return;
    setLoading(true);
    setError('');
    setUploadResult('');
    try {
      const token = getToken();
      if (!token) throw new Error('Missing token');

      const form = new FormData();
      form.set('projectId', projectId);
      form.set('file', file);

      const res = await fetch(`${API_BASE_URL}/api/logs/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const json = (await res.json()) as unknown;
      if (!json || typeof json !== 'object') {
        throw new Error(`Invalid response (${res.status})`);
      }
      const body = json as {
        success: boolean;
        data: UploadResponse | null;
        error: { code: string; message: string } | null;
      };
      if (!body.success || !body.data) {
        throw new Error(`${body.error?.code ?? `HTTP_${res.status}`}: ${body.error?.message ?? 'Upload failed'}`);
      }

      setUploadResult(`logFileId=${body.data.logFileId}, status=${body.data.status}`);
      const now = new Date();
      const end = formatDatetimeLocal(now);
      const start = formatDatetimeLocal(new Date(now.getTime() - 24 * 60 * 60 * 1000));
      setStartLocal(start);
      setEndLocal(end);

      window.setTimeout(() => {
        void search(true, { startLocal: start, endLocal: end });
      }, 1200);
    } catch (e: unknown) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function search(resetCursor: boolean, range?: { startLocal: string; endLocal: string }) {
    if (!projectId) return;
    setLoading(true);
    setError('');
    try {
      const startValue = range?.startLocal ?? startLocal;
      const endValue = range?.endLocal ?? endLocal;
      if (!startValue || !endValue) {
        setError(t('logs.timeRangeRequired'));
        return;
      }
      const startMs = new Date(startValue).getTime();
      const endMs = new Date(endValue).getTime();
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
        setError(t('logs.timeRangeRequired'));
        return;
      }
      if (endMs <= startMs) {
        setError(t('logs.invalidTimeRange'));
        return;
      }

      const startTime = toIsoFromDatetimeLocal(startValue);
      const endTime = toIsoFromDatetimeLocal(endValue);
      const q = new URLSearchParams({
        projectId,
        startTime,
        endTime,
      });
      if (eventName.trim()) q.set('eventName', eventName.trim());
      if (!resetCursor && cursor) q.set('cursor', cursor);

      const data = await apiFetch<SearchResponse>(`/api/logs/events/search?${q.toString()}`);
      if (resetCursor) {
        setResults(data.items);
      } else {
        setResults((prev) => [...prev, ...data.items]);
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

  return (
    <div className={shellStyles.grid}>
      <div className={shellStyles.card}>
        <h1 style={{ fontSize: 20, marginBottom: 8 }}>{t('logs.title')}</h1>
        <div className={formStyles.row}>
          <ProjectPicker projectId={projectId} onChange={setProjectId} />
        </div>

        <div className={shellStyles.grid} style={{ marginTop: 10 }}>
          <div className={formStyles.field}>
            <div className={formStyles.label}>{t('logs.uploadTitle')}</div>
            <input
              className={formStyles.input}
              type="file"
              accept=".jsonl,application/json,text/plain"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <div className={formStyles.muted}>
              {t('logs.uploadHint')}
            </div>
          </div>
          <div className={formStyles.row}>
            <button
              className={shellStyles.button}
              type="button"
              disabled={!projectId || !file || loading}
              onClick={() => void upload()}
            >
              {t('common.upload')}
            </button>
            {uploadResult ? <div className={formStyles.success}>{uploadResult}</div> : null}
          </div>
        </div>

        <div className={shellStyles.grid} style={{ marginTop: 16 }}>
          <div className={formStyles.row}>
            <div className={formStyles.field}>
              <div className={formStyles.label}>{t('logs.eventNameOptional')}</div>
              <input
                className={formStyles.input}
                value={eventName}
                onChange={(e) => setEventName(e.target.value)}
                placeholder="e.g. SDK init start"
              />
            </div>
            <div className={formStyles.field}>
              <div className={formStyles.label}>{t('logs.startTime')}</div>
              <input
                className={formStyles.input}
                type="datetime-local"
                value={startLocal}
                onChange={(e) => setStartLocal(e.target.value)}
              />
            </div>
            <div className={formStyles.field}>
              <div className={formStyles.label}>{t('logs.endTime')}</div>
              <input
                className={formStyles.input}
                type="datetime-local"
                value={endLocal}
                onChange={(e) => setEndLocal(e.target.value)}
              />
            </div>
          </div>

          <div className={formStyles.row}>
            <button className={shellStyles.button} type="button" disabled={loading} onClick={() => setPresetRange(1)}>
              {t('logs.preset.1h')}
            </button>
            <button className={shellStyles.button} type="button" disabled={loading} onClick={() => setPresetRange(24)}>
              {t('logs.preset.24h')}
            </button>
            <button className={shellStyles.button} type="button" disabled={loading} onClick={() => setPresetRange(24 * 7)}>
              {t('logs.preset.7d')}
            </button>
            <button
              className={shellStyles.button}
              type="button"
              disabled={!canSearch || loading}
              onClick={() => void search(true)}
            >
              {t('common.search')}
            </button>
            <button
              className={shellStyles.button}
              type="button"
              disabled={!canSearch || loading || !nextCursor}
              onClick={() => void search(false)}
            >
              {t('common.loadMore')}
            </button>
            <div className={formStyles.muted}>
              {loading ? t('common.loading') : t('common.items', { count: results.length })}
            </div>
          </div>
        </div>

        {error ? <div className={formStyles.error}>{error}</div> : null}
      </div>

      <div className={shellStyles.card}>
        <div className={shellStyles.tableWrap}>
          <table className={shellStyles.table}>
            <thead>
              <tr>
                <th>{t('table.time')}</th>
                <th>{t('table.event')}</th>
                <th>{t('table.level')}</th>
                <th>{t('table.sdk')}</th>
                <th>{t('table.app')}</th>
                <th>{t('table.id')}</th>
              </tr>
            </thead>
            <tbody>
              {results.map((e) => (
                <tr key={e.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {new Date(e.timestampMs).toLocaleString(localeTag)}
                  </td>
                  <td style={{ minWidth: 260 }}>{e.eventName}</td>
                  <td>{e.level}</td>
                  <td>{e.sdkVersion ?? '-'}</td>
                  <td>{e.appId ?? '-'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <span className={formStyles.muted}>{e.id}</span>
                  </td>
                </tr>
              ))}
              {results.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: 10 }} className={formStyles.muted}>
                    {t('logs.empty')}
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
