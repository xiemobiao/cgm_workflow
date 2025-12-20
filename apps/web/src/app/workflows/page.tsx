'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import shellStyles from '@/components/AppShell.module.css';
import formStyles from '@/components/Form.module.css';
import { ProjectPicker } from '@/components/ProjectPicker';
import { ApiClientError, apiFetch } from '@/lib/api';
import { getProjectId } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';

type WorkflowRow = {
  id: string;
  projectId: string;
  requirementId: string;
  status: string;
  currentStage: string | null;
  requirementTitle: string;
  updatedAt: string;
};

export default function WorkflowsPage() {
  const { localeTag, t } = useI18n();
  const [projectId, setProjectId] = useState('');
  const [rows, setRows] = useState<WorkflowRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const id = window.setTimeout(() => {
      const stored = getProjectId() ?? '';
      setProjectId(stored);
      if (stored) setLoading(true);
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    apiFetch<WorkflowRow[]>(`/api/workflows?projectId=${projectId}`)
      .then((data) => {
        if (cancelled) return;
        setError('');
        setRows(data);
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
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  return (
    <div className={shellStyles.grid}>
      <div className={shellStyles.card}>
        <h1 style={{ fontSize: 20, marginBottom: 8 }}>{t('workflows.title')}</h1>
        <div className={formStyles.row}>
          <ProjectPicker
            projectId={projectId}
            onChange={(id) => {
              setError('');
              setLoading(true);
              setProjectId(id);
            }}
          />
          <button
            className={shellStyles.button}
            type="button"
            disabled={!projectId || loading}
            onClick={() => {
              setLoading(true);
              setError('');
              apiFetch<WorkflowRow[]>(`/api/workflows?projectId=${projectId}`)
                .then(setRows)
                .catch((e: unknown) => {
                  const msg =
                    e instanceof ApiClientError
                      ? `${e.code}: ${e.message}`
                      : String(e);
                  setError(msg);
                })
                .finally(() => setLoading(false));
            }}
          >
            {t('common.refresh')}
          </button>
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
                <th>{t('table.stage')}</th>
                <th>{t('table.status')}</th>
                <th>{t('table.updated')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((w) => (
                <tr key={w.id}>
                  <td style={{ minWidth: 300 }}>
                    <Link href={`/workflows/${w.id}`}>{w.requirementTitle}</Link>
                  </td>
                  <td>{w.currentStage ?? '-'}</td>
                  <td>{w.status}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {new Date(w.updatedAt).toLocaleString(localeTag)}
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ padding: 10 }} className={formStyles.muted}>
                    {t('workflows.empty')}
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
