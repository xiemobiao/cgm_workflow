'use client';

import { useEffect, useMemo, useState } from 'react';
import formStyles from '@/components/Form.module.css';
import { ApiClientError, apiFetch } from '@/lib/api';
import { getProjectId, setProjectId } from '@/lib/auth';
import { PROJECTS_REFRESH_EVENT } from '@/lib/projects';
import { useI18n } from '@/lib/i18n';

type Project = {
  id: string;
  name: string;
  role: string;
};

export function ProjectPicker(props: {
  projectId: string;
  onChange: (projectId: string) => void;
}) {
  const { t } = useI18n();
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const load = () => {
      apiFetch<Project[]>('/api/projects')
        .then((rows) => {
          if (cancelled) return;
          setError('');
          setProjects(rows);
        })
        .catch((e: unknown) => {
          if (cancelled) return;
          const msg =
            e instanceof ApiClientError ? `${e.code}: ${e.message}` : String(e);
          setError(msg);
        });
    };

    const onRefresh = () => load();
    load();
    window.addEventListener(PROJECTS_REFRESH_EVENT, onRefresh);
    return () => {
      cancelled = true;
      window.removeEventListener(PROJECTS_REFRESH_EVENT, onRefresh);
    };
  }, []);

  const effectiveProjectId = useMemo(() => {
    if (props.projectId) return props.projectId;
    return getProjectId() ?? '';
  }, [props.projectId]);

  useEffect(() => {
    if (effectiveProjectId) return;
    if (!projects[0]?.id) return;
    setProjectId(projects[0].id);
    props.onChange(projects[0].id);
  }, [effectiveProjectId, projects, props]);

  return (
    <div className={formStyles.field} style={{ minWidth: 320 }}>
      <div className={formStyles.label}>{t('project.label')}</div>
      <select
        className={formStyles.select}
        value={effectiveProjectId}
        onChange={(e) => {
          const next = e.target.value;
          setProjectId(next);
          props.onChange(next);
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
      {error ? <div className={formStyles.error}>{error}</div> : null}
    </div>
  );
}
