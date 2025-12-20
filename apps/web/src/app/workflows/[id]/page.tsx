'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import shellStyles from '@/components/AppShell.module.css';
import formStyles from '@/components/Form.module.css';
import { ApiClientError, apiFetch } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

type WorkflowDetail = {
  id: string;
  projectId: string;
  status: string;
  requirement: {
    id: string;
    externalId: string;
    title: string;
    status: string;
    sourceStatus: string | null;
  };
  stages: Array<{
    id: string;
    stageName: string;
    status: string;
    gate: null | {
      id: string;
      status: string;
      approverId: string | null;
      decisionReason: string | null;
      decidedAt: string | null;
    };
  }>;
  updatedAt: string;
};

export default function WorkflowDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const workflowId = params?.id ?? '';
  const { t } = useI18n();

  const [data, setData] = useState<WorkflowDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reasonByGateId, setReasonByGateId] = useState<Record<string, string>>({});

  const load = useMemo(
    () => async () => {
      if (!workflowId) return;
      setLoading(true);
      setError('');
      try {
        const detail = await apiFetch<WorkflowDetail>(`/api/workflows/${workflowId}`);
        setData(detail);
      } catch (e: unknown) {
        const msg =
          e instanceof ApiClientError ? `${e.code}: ${e.message}` : String(e);
        setError(msg);
      } finally {
        setLoading(false);
      }
    },
    [workflowId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className={shellStyles.grid}>
      <div className={shellStyles.card}>
        <div className={formStyles.row} style={{ justifyContent: 'space-between' }}>
          <h1 style={{ fontSize: 20, marginBottom: 0 }}>{t('workflow.detail.title')}</h1>
          <div className={formStyles.row}>
            <button className={shellStyles.button} type="button" onClick={() => router.back()}>
              {t('common.back')}
            </button>
            <button
              className={shellStyles.button}
              type="button"
              disabled={loading}
              onClick={() => void load()}
            >
              {t('common.refresh')}
            </button>
          </div>
        </div>
        {error ? <div className={formStyles.error}>{error}</div> : null}
        {!data ? (
          <div className={formStyles.muted} style={{ marginTop: 8 }}>
            {loading ? t('common.loading') : t('workflow.noData')}
          </div>
        ) : (
          <div className={shellStyles.grid} style={{ marginTop: 10 }}>
            <div className={shellStyles.card}>
              <div style={{ fontWeight: 700 }}>{data.requirement.title}</div>
              <div className={formStyles.muted}>
                {data.requirement.externalId} · requirementStatus={data.requirement.status} ·
                sourceStatus={data.requirement.sourceStatus ?? '-'}
              </div>
            </div>

            <div className={shellStyles.card}>
              <div className={formStyles.muted} style={{ marginBottom: 8 }}>
                {t('workflow.stages')}
              </div>
              <div className={shellStyles.grid}>
                {data.stages.map((s) => (
                  <div
                    key={s.id}
                    className={shellStyles.card}
                    style={{ border: '1px solid rgba(255,255,255,0.10)' }}
                  >
                    <div className={formStyles.row} style={{ justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontWeight: 700 }}>{s.stageName}</div>
                        <div className={formStyles.muted}>{t('workflow.stageStatus')}={s.status}</div>
                      </div>
                      <div className={formStyles.muted}>
                        {t('workflow.gate')}={s.gate ? s.gate.status : '-'}
                      </div>
                    </div>

                    {s.gate && s.gate.status === 'pending' ? (
                      <div className={shellStyles.grid} style={{ marginTop: 10 }}>
                        <div className={formStyles.field}>
                          <div className={formStyles.label}>{t('workflow.reason')}</div>
                          <input
                            className={formStyles.input}
                            value={reasonByGateId[s.gate.id] ?? ''}
                            onChange={(e) =>
                              setReasonByGateId((prev) => ({
                                ...prev,
                                [s.gate!.id]: e.target.value,
                              }))
                            }
                            placeholder="e.g. urgent hotfix"
                          />
                        </div>
                        <div className={formStyles.row}>
                          <button
                            className={shellStyles.button}
                            type="button"
                            disabled={loading}
                            onClick={async () => {
                              if (!s.gate) return;
                              setLoading(true);
                              setError('');
                              try {
                                await apiFetch(`/api/workflows/${workflowId}/gates/${s.gate.id}/approve`, {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({
                                    reason: reasonByGateId[s.gate.id] || undefined,
                                  }),
                                });
                                await load();
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
                            {t('workflow.approve')}
                          </button>
                          <button
                            className={shellStyles.button}
                            type="button"
                            disabled={loading || !(reasonByGateId[s.gate.id] ?? '').trim()}
                            onClick={async () => {
                              if (!s.gate) return;
                              setLoading(true);
                              setError('');
                              try {
                                await apiFetch(`/api/workflows/${workflowId}/gates/${s.gate.id}/override`, {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({
                                    reason: reasonByGateId[s.gate.id] ?? '',
                                  }),
                                });
                                await load();
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
                            {t('workflow.override')}
                          </button>
                        </div>
                      </div>
                    ) : s.gate ? (
                      <div className={formStyles.muted} style={{ marginTop: 10 }}>
                        decidedAt={s.gate.decidedAt ?? '-'} reason={s.gate.decisionReason ?? '-'}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
