'use client';

import shellStyles from '@/components/AppShell.module.css';
import formStyles from '@/components/Form.module.css';
import { API_BASE_URL } from '@/lib/config';
import { clearProjectId, getProjectId, getToken } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function SettingsPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [token, setToken] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setToken(getToken());
      setProjectId(getProjectId());
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <div className={shellStyles.grid}>
      <div className={shellStyles.card}>
        <h1 style={{ fontSize: 20, marginBottom: 8 }}>{t('settings.title')}</h1>
        <div className={shellStyles.grid}>
          <div className={formStyles.field}>
            <div className={formStyles.label}>{t('settings.apiBaseUrl')}</div>
            <div className={formStyles.muted}>{API_BASE_URL}</div>
          </div>
          <div className={formStyles.field}>
            <div className={formStyles.label}>{t('settings.token')}</div>
            <div className={formStyles.muted}>
              {token ? t('settings.tokenPresent', { count: token.length }) : t('settings.tokenMissing')}
            </div>
          </div>
          <div className={formStyles.field}>
            <div className={formStyles.label}>{t('settings.selectedProjectId')}</div>
            <div className={formStyles.muted}>{projectId ?? t('common.none')}</div>
          </div>
          <div className={formStyles.row}>
            <button
              className={shellStyles.button}
              type="button"
              onClick={() => {
                clearProjectId();
                setProjectId(null);
              }}
            >
              {t('settings.clearProjectSelection')}
            </button>
            <button
              className={shellStyles.button}
              type="button"
              onClick={() => router.refresh()}
            >
              {t('settings.refreshPage')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
