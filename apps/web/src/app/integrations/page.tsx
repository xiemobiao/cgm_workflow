'use client';

import { useEffect, useState } from 'react';
import shellStyles from '@/components/AppShell.module.css';
import formStyles from '@/components/Form.module.css';
import { ProjectPicker } from '@/components/ProjectPicker';
import { ApiClientError, apiFetch } from '@/lib/api';
import { getProjectId } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';

const DEFAULT_MAPPING = `{
  "fieldMap": {
    "external_id": "id",
    "title": "title",
    "status": "status",
    "type": "type",
    "priority": "priority",
    "owner": "owner",
    "tags": "tags"
  },
  "statusMap": {
    "In Progress": "Development",
    "Testing": "Test",
    "Done": "Release"
  },
  "filters": {
    "typeContains": "Requirement",
    "tagContains": "CGM"
  }
}`;

export default function IntegrationsPage() {
  const { t } = useI18n();
  const [projectId, setProjectId] = useState('');
  const [type, setType] = useState('pingcode');
  const [secretsRef, setSecretsRef] = useState('secret://demo');
  const [integrationId, setIntegrationId] = useState('');
  const [mappingJson, setMappingJson] = useState(DEFAULT_MAPPING);
  const [rawIntegration, setRawIntegration] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const id = window.setTimeout(() => {
      setProjectId(getProjectId() ?? '');
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  async function loadIntegration(id: string) {
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const data = await apiFetch<unknown>(`/api/integrations/${id}`);
      setRawIntegration(JSON.stringify(data, null, 2));
    } catch (e: unknown) {
      const msg =
        e instanceof ApiClientError ? `${e.code}: ${e.message}` : String(e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={shellStyles.grid}>
      <div className={shellStyles.card}>
        <h1 style={{ fontSize: 20, marginBottom: 8 }}>{t('integrations.title')}</h1>
        <div className={formStyles.row}>
          <ProjectPicker projectId={projectId} onChange={setProjectId} />
        </div>

        <div className={shellStyles.grid} style={{ marginTop: 12 }}>
          <div className={formStyles.row}>
            <div className={formStyles.field}>
              <div className={formStyles.label}>type</div>
              <select
                className={formStyles.select}
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                <option value="pingcode">pingcode</option>
                <option value="feishu">feishu</option>
                <option value="gitlab">gitlab</option>
              </select>
            </div>
            <div className={formStyles.field} style={{ flex: 1, minWidth: 260 }}>
              <div className={formStyles.label}>secretsRef</div>
              <input
                className={formStyles.input}
                value={secretsRef}
                onChange={(e) => setSecretsRef(e.target.value)}
              />
            </div>
            <button
              className={shellStyles.button}
              type="button"
              disabled={!projectId || loading}
              onClick={async () => {
                setLoading(true);
                setError('');
                setSuccess('');
                try {
                  const data = await apiFetch<{ id: string }>(`/api/integrations`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ projectId, type, secretsRef }),
                  });
                  setIntegrationId(data.id);
                  setSuccess(`created integrationId=${data.id}`);
                  await loadIntegration(data.id);
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
              {t('integrations.createEnable')}
            </button>
          </div>
        </div>

        <div className={shellStyles.grid} style={{ marginTop: 12 }}>
          <div className={formStyles.row}>
            <div className={formStyles.field} style={{ flex: 1, minWidth: 280 }}>
              <div className={formStyles.label}>integrationId</div>
              <input
                className={formStyles.input}
                value={integrationId}
                onChange={(e) => setIntegrationId(e.target.value)}
                placeholder="uuid"
              />
            </div>
            <button
              className={shellStyles.button}
              type="button"
              disabled={!integrationId || loading}
              onClick={() => void loadIntegration(integrationId)}
            >
              {t('integrations.load')}
            </button>
          </div>
        </div>

        <div className={shellStyles.grid} style={{ marginTop: 12 }}>
          <div className={formStyles.field}>
            <div className={formStyles.label}>{t('integrations.mappingJson')}</div>
            <textarea
              className={formStyles.textarea}
              value={mappingJson}
              onChange={(e) => setMappingJson(e.target.value)}
            />
          </div>
          <div className={formStyles.row}>
            <button
              className={shellStyles.button}
              type="button"
              disabled={!integrationId || loading}
              onClick={async () => {
                setLoading(true);
                setError('');
                setSuccess('');
                try {
                  const mapping = JSON.parse(mappingJson) as unknown;
                  const data = await apiFetch<{ integrationId: string; updatedAt: string }>(
                    `/api/integrations/${integrationId}/mapping`,
                    {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(mapping),
                    },
                  );
                  setSuccess(`saved mapping, updatedAt=${data.updatedAt}`);
                  await loadIntegration(integrationId);
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
              {t('integrations.saveMapping')}
            </button>
            {success ? <div className={formStyles.success}>{success}</div> : null}
          </div>
        </div>

        {error ? <div className={formStyles.error}>{error}</div> : null}
      </div>

      <div className={shellStyles.card}>
        <div className={formStyles.muted} style={{ marginBottom: 8 }}>
          {t('integrations.integrationJson')}
        </div>
        <pre
          style={{
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            fontSize: 12,
          }}
        >
          {rawIntegration || '—'}
        </pre>
      </div>
    </div>
  );
}
