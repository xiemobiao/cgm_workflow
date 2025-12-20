'use client';

import { useEffect, useMemo, useState } from 'react';
import shellStyles from '@/components/AppShell.module.css';
import formStyles from '@/components/Form.module.css';
import { ProjectPicker } from '@/components/ProjectPicker';
import { ApiClientError, apiFetch } from '@/lib/api';
import { getProjectId } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';

type RequirementRow = {
  id: string;
  externalId: string;
  title: string;
  status: string;
  sourceStatus: string | null;
  hasWorkflow: boolean;
  updatedAt: string;
};

export default function RequirementsPage() {
  const { localeTag, t } = useI18n();
  const [projectId, setProjectId] = useState('');
  const [rows, setRows] = useState<RequirementRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [integrationId, setIntegrationId] = useState('');
  const [syncResult, setSyncResult] = useState('');

  useEffect(() => {
    const id = window.setTimeout(() => {
      const stored = getProjectId() ?? '';
      setProjectId(stored);
      if (stored) setLoading(true);
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  const canLoad = useMemo(() => Boolean(projectId), [projectId]);

  useEffect(() => {
    if (!canLoad) return;
    let cancelled = false;
    apiFetch<RequirementRow[]>(`/api/requirements?projectId=${projectId}`)
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
  }, [canLoad, projectId]);

  return (
    <div className={shellStyles.grid}>
      <div className={shellStyles.card}>
        <h1 style={{ fontSize: 20, marginBottom: 8 }}>{t('requirements.title')}</h1>
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
            onClick={() => {
              if (!projectId) return;
              setLoading(true);
              setError('');
              apiFetch<RequirementRow[]>(`/api/requirements?projectId=${projectId}`)
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
            disabled={!projectId || loading}
          >
            {t('common.refresh')}
          </button>
        </div>

        <div className={shellStyles.grid} style={{ marginTop: 10 }}>
          <div className={formStyles.field}>
            <div className={formStyles.label}>{t('requirements.syncIntegrationId')}</div>
            <input
              className={formStyles.input}
              value={integrationId}
              onChange={(e) => setIntegrationId(e.target.value)}
              placeholder="integration uuid"
            />
          </div>
          <div className={formStyles.row}>
            <button
              className={shellStyles.button}
              type="button"
              disabled={!projectId || !integrationId || loading}
              onClick={async () => {
                setSyncResult('');
                setError('');
                setLoading(true);
                try {
                  const res = await apiFetch<{ synced: number; createdWorkflows: number }>(
                    '/api/requirements/sync',
                    {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ projectId, integrationId }),
                    },
                  );
                  setSyncResult(
                    `synced=${res.synced}, createdWorkflows=${res.createdWorkflows}`,
                  );
                } catch (e: unknown) {
                  const msg =
                    e instanceof ApiClientError
                      ? `${e.code}: ${e.message}`
                      : String(e);
                  setError(msg);
                } finally {
                  setLoading(false);
                }
              }}
            >
              {t('requirements.sync')}
            </button>
            {syncResult ? <div className={formStyles.success}>{syncResult}</div> : null}
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
                <th>{t('table.externalId')}</th>
                <th>{t('table.title')}</th>
                <th>{t('table.status')}</th>
                <th>{t('table.sourceStatus')}</th>
                <th>{t('table.workflow')}</th>
                <th>{t('table.updated')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{r.externalId}</td>
                  <td style={{ minWidth: 280 }}>{r.title}</td>
                  <td>{r.status}</td>
                  <td>{r.sourceStatus ?? '-'}</td>
                  <td>{r.hasWorkflow ? t('common.yes') : t('common.no')}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {new Date(r.updatedAt).toLocaleString(localeTag)}
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: 10 }} className={formStyles.muted}>
                    {t('requirements.empty')}
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
