'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import shellStyles from '@/components/AppShell.module.css';
import formStyles from '@/components/Form.module.css';
import { ApiClientError, apiFetch } from '@/lib/api';
import { getProjectId, setProjectId } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';

type Project = {
  id: string;
  name: string;
  type: string;
  status: string;
  role: string;
};

export default function DashboardPage() {
  const { t } = useI18n();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectIdState] = useState<string>('');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    const id = window.setTimeout(() => {
      setProjectIdState(getProjectId() ?? '');
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    apiFetch<Project[]>('/api/projects')
      .then((rows) => {
        if (cancelled) return;
        setError('');
        setProjects(rows);
        setProjectIdState((current) => {
          if (current) return current;
          const first = rows[0]?.id;
          if (!first) return current;
          setProjectId(first);
          return first;
        });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const msg =
          e instanceof ApiClientError ? `${e.code}: ${e.message}` : String(e);
        setError(msg);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const current = useMemo(
    () => projects.find((p) => p.id === projectId) ?? null,
    [projects, projectId],
  );

  return (
    <div className={shellStyles.grid}>
      <div className={shellStyles.card}>
        <h1 style={{ fontSize: 20, marginBottom: 8 }}>{t('dashboard.title')}</h1>
        <div className={formStyles.row}>
          <div className={formStyles.field} style={{ minWidth: 320 }}>
            <div className={formStyles.label}>{t('project.current')}</div>
            <select
              className={formStyles.select}
              value={projectId}
              onChange={(e) => {
                const next = e.target.value;
                setProjectId(next);
                setProjectIdState(next);
              }}
            >
              <option value="" disabled>
                {t('project.selectPlaceholder')}
              </option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.role})
                </option>
              ))}
            </select>
          </div>
          <div className={formStyles.muted}>
            {current ? (
              <div>
                <div>projectId: {current.id}</div>
                <div>
                  {current.type} / {current.status}
                </div>
              </div>
            ) : (
              <div>{t('dashboard.needProjectHint')}</div>
            )}
          </div>
        </div>

        {error ? <div className={formStyles.error}>{error}</div> : null}
      </div>

      <div className={`${shellStyles.grid} ${shellStyles.grid2}`}>
        <div className={shellStyles.card}>
          <h2 style={{ fontSize: 16, marginBottom: 8 }}>{t('dashboard.corePages')}</h2>
          <div className={shellStyles.grid}>
            <Link href="/requirements">{t('nav.requirements')}</Link>
            <Link href="/workflows">{t('nav.workflows')}</Link>
            <Link href="/logs">{t('nav.logs')}</Link>
            <Link href="/incidents">{t('nav.incidents')}</Link>
          </div>
        </div>

        <div className={shellStyles.card}>
          <h2 style={{ fontSize: 16, marginBottom: 8 }}>{t('dashboard.integrationsAndSettings')}</h2>
          <div className={shellStyles.grid}>
            <Link href="/integrations">{t('nav.integrations')}</Link>
            <Link href="/settings">{t('nav.settings')}</Link>
          </div>
          <div className={formStyles.muted} style={{ marginTop: 10 }}>
            {t('dashboard.adminHint', {
              email: 'admin@local.dev',
              password: 'admin123456',
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
