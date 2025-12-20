'use client';

import { useCallback, useEffect, useState } from 'react';
import shellStyles from '@/components/AppShell.module.css';
import formStyles from '@/components/Form.module.css';
import { ProjectPicker } from '@/components/ProjectPicker';
import { ApiClientError, apiFetch } from '@/lib/api';
import { getProjectId } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';

type IncidentRow = {
  id: string;
  title: string;
  severity: string;
  status: string;
  startTime: string;
  endTime: string | null;
  logEventCount: number;
  updatedAt: string;
};

function nowIso() {
  return new Date().toISOString();
}

export default function IncidentsPage() {
  const { localeTag, t } = useI18n();
  const [projectId, setProjectId] = useState('');
  const [rows, setRows] = useState<IncidentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [title, setTitle] = useState('');
  const [severity, setSeverity] = useState('high');
  const [status, setStatus] = useState('open');
  const [startTime, setStartTime] = useState(nowIso());
  const [endTime, setEndTime] = useState<string>('');
  const [logEventIds, setLogEventIds] = useState<string>('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const id = window.setTimeout(() => {
      setProjectId(getProjectId() ?? '');
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch<IncidentRow[]>(`/api/incidents?projectId=${projectId}`);
      setRows(data);
    } catch (e: unknown) {
      const msg = e instanceof ApiClientError ? `${e.code}: ${e.message}` : String(e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className={shellStyles.grid}>
      <div className={shellStyles.card}>
        <h1 style={{ fontSize: 20, marginBottom: 8 }}>{t('incidents.title')}</h1>
        <div className={formStyles.row}>
          <ProjectPicker projectId={projectId} onChange={setProjectId} />
          <button
            className={shellStyles.button}
            type="button"
            disabled={!projectId || loading}
            onClick={() => void load()}
          >
            {t('common.refresh')}
          </button>
        </div>

        <div className={shellStyles.grid} style={{ marginTop: 12 }}>
          <div className={formStyles.field}>
            <div className={formStyles.label}>{t('incidents.titleLabel')}</div>
            <input className={formStyles.input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. BLE reconnect failure" />
          </div>

          <div className={formStyles.row}>
            <div className={formStyles.field}>
              <div className={formStyles.label}>{t('incidents.severity')}</div>
              <select className={formStyles.select} value={severity} onChange={(e) => setSeverity(e.target.value)}>
                <option value="low">{t('severity.low')}</option>
                <option value="medium">{t('severity.medium')}</option>
                <option value="high">{t('severity.high')}</option>
                <option value="critical">{t('severity.critical')}</option>
              </select>
            </div>

            <div className={formStyles.field}>
              <div className={formStyles.label}>{t('incidents.status')}</div>
              <select className={formStyles.select} value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="open">{t('incidentStatus.open')}</option>
                <option value="investigating">{t('incidentStatus.investigating')}</option>
                <option value="resolved">{t('incidentStatus.resolved')}</option>
                <option value="closed">{t('incidentStatus.closed')}</option>
              </select>
            </div>
          </div>

          <div className={formStyles.field}>
            <div className={formStyles.label}>{t('incidents.startTime')}</div>
            <input className={formStyles.input} value={startTime} onChange={(e) => setStartTime(e.target.value)} placeholder={nowIso()} />
          </div>

          <div className={formStyles.field}>
            <div className={formStyles.label}>{t('incidents.endTime')}</div>
            <input className={formStyles.input} value={endTime} onChange={(e) => setEndTime(e.target.value)} placeholder="2025-01-02T12:00:00Z" />
          </div>

          <div className={formStyles.field}>
            <div className={formStyles.label}>{t('incidents.logEventIds')}</div>
            <textarea className={formStyles.textarea} value={logEventIds} onChange={(e) => setLogEventIds(e.target.value)} placeholder="uuid, uuid, uuid" />
          </div>

          <div className={formStyles.row}>
            <button
              className={shellStyles.button}
              type="button"
              disabled={!projectId || !title.trim() || loading}
              onClick={async () => {
                setSuccess('');
                setError('');
                setLoading(true);
                try {
                  const ids = logEventIds
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean);
                  const res = await apiFetch<{ id: string; status: string }>('/api/incidents', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      projectId,
                      title: title.trim(),
                      severity,
                      status,
                      startTime,
                      endTime: endTime.trim() ? endTime.trim() : undefined,
                      logEventIds: ids.length > 0 ? ids : undefined,
                    }),
                  });
                  setSuccess(`created id=${res.id}, status=${res.status}`);
                  setTitle('');
                  setLogEventIds('');
                  await load();
                } catch (e: unknown) {
                  const msg = e instanceof ApiClientError ? `${e.code}: ${e.message}` : String(e);
                  setError(msg);
                } finally {
                  setLoading(false);
                }
              }}
            >
              {t('common.create')}
            </button>
            {success ? <div className={formStyles.success}>{success}</div> : null}
          </div>
        </div>

        {error ? <div className={formStyles.error}>{error}</div> : null}
      </div>

      <div className={shellStyles.card}>
        <div className={formStyles.muted} style={{ marginBottom: 8 }}>
          {loading ? t('common.loading') : t('common.items', { count: rows.length })}
        </div>
        <div className={shellStyles.tableWrap}>
          <table className={shellStyles.table}>
            <thead>
              <tr>
                <th>{t('table.title')}</th>
                <th>{t('incidents.severity')}</th>
                <th>{t('table.status')}</th>
                <th>{t('table.logEvents')}</th>
                <th>{t('table.updated')}</th>
                <th>{t('table.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ minWidth: 260 }}>{r.title}</td>
                  <td>{r.severity}</td>
                  <td>{r.status}</td>
                  <td>{r.logEventCount}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {new Date(r.updatedAt).toLocaleString(localeTag)}
                  </td>
                  <td>
                    <button
                      className={shellStyles.button}
                      type="button"
                      disabled={loading}
                      onClick={async () => {
                        setError('');
                        setSuccess('');
                        setLoading(true);
                        try {
                          const res = await apiFetch<{ id: string; status: string }>(`/api/incidents/${r.id}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ status: 'resolved', endTime: new Date().toISOString() }),
                          });
                          setSuccess(`updated id=${res.id}, status=${res.status}`);
                          await load();
                        } catch (e: unknown) {
                          const msg =
                            e instanceof ApiClientError ? `${e.code}: ${e.message}` : String(e);
                          setError(msg);
                        } finally {
                          setLoading(false);
                        }
                      }}
                    >
                      {t('incidents.markResolved')}
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: 10 }} className={formStyles.muted}>
                    {t('incidents.empty')}
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
