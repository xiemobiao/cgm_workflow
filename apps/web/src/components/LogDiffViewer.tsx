'use client';

import { useState } from 'react';
import styles from './LogDiffViewer.module.css';
import shellStyles from './AppShell.module.css';
import formStyles from './Form.module.css';
import { ApiClientError, apiFetch } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

interface SessionFilter {
  linkCode?: string;
  deviceMac?: string;
  startTime?: string;
  endTime?: string;
}

interface CompareResult {
  summary: {
    aEventCount: number;
    bEventCount: number;
    aErrorCount: number;
    bErrorCount: number;
    commonEventTypes: number;
    diffEventTypes: number;
  };
  eventTypes: {
    common: string[];
    onlyInA: string[];
    onlyInB: string[];
  };
  timeline: Array<{
    timestampMs: number;
    eventA: { eventName: string; level: number } | null;
    eventB: { eventName: string; level: number } | null;
    status: 'match' | 'diff' | 'only_a' | 'only_b';
  }>;
}

interface Props {
  projectId: string;
}

function getLevelColor(level: number): string {
  if (level >= 5) return '#dc2626';
  if (level >= 4) return '#ea580c';
  if (level >= 3) return '#ca8a04';
  if (level >= 2) return '#2563eb';
  return '#6b7280';
}

export function LogDiffViewer({ projectId }: Props) {
  const { t } = useI18n();

  const [sessionA, setSessionA] = useState<SessionFilter>({});
  const [sessionB, setSessionB] = useState<SessionFilter>({});
  const [result, setResult] = useState<CompareResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCompare = async () => {
    if (!projectId) return;
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const data = await apiFetch<CompareResult>('/api/reports/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          sessionA,
          sessionB,
        }),
      });
      setResult(data);
    } catch (e: unknown) {
      const msg = e instanceof ApiClientError ? `${e.code}: ${e.message}` : String(e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.title}>{t('compare.title')}</h2>
        <p className={styles.desc}>{t('compare.desc')}</p>
      </div>

      <div className={styles.filterSection}>
        <div className={styles.sessionCard}>
          <div className={styles.sessionLabel}>{t('compare.sessionA')}</div>
          <div className={styles.sessionInputs}>
            <div className={formStyles.field}>
              <div className={formStyles.label}>{t('reports.linkCode')}</div>
              <input
                className={formStyles.input}
                value={sessionA.linkCode ?? ''}
                onChange={(e) => setSessionA({ ...sessionA, linkCode: e.target.value || undefined })}
                placeholder="linkCode"
              />
            </div>
            <div className={formStyles.field}>
              <div className={formStyles.label}>{t('reports.deviceMac')}</div>
              <input
                className={formStyles.input}
                value={sessionA.deviceMac ?? ''}
                onChange={(e) => setSessionA({ ...sessionA, deviceMac: e.target.value || undefined })}
                placeholder="AA:BB:CC:DD:EE:FF"
              />
            </div>
            <div className={formStyles.row}>
              <div className={formStyles.field}>
                <div className={formStyles.label}>{t('reports.startTime')}</div>
                <input
                  className={formStyles.input}
                  type="datetime-local"
                  onChange={(e) => setSessionA({
                    ...sessionA,
                    startTime: e.target.value ? new Date(e.target.value).toISOString() : undefined,
                  })}
                />
              </div>
              <div className={formStyles.field}>
                <div className={formStyles.label}>{t('reports.endTime')}</div>
                <input
                  className={formStyles.input}
                  type="datetime-local"
                  onChange={(e) => setSessionA({
                    ...sessionA,
                    endTime: e.target.value ? new Date(e.target.value).toISOString() : undefined,
                  })}
                />
              </div>
            </div>
          </div>
        </div>

        <div className={styles.sessionCard}>
          <div className={styles.sessionLabel}>{t('compare.sessionB')}</div>
          <div className={styles.sessionInputs}>
            <div className={formStyles.field}>
              <div className={formStyles.label}>{t('reports.linkCode')}</div>
              <input
                className={formStyles.input}
                value={sessionB.linkCode ?? ''}
                onChange={(e) => setSessionB({ ...sessionB, linkCode: e.target.value || undefined })}
                placeholder="linkCode"
              />
            </div>
            <div className={formStyles.field}>
              <div className={formStyles.label}>{t('reports.deviceMac')}</div>
              <input
                className={formStyles.input}
                value={sessionB.deviceMac ?? ''}
                onChange={(e) => setSessionB({ ...sessionB, deviceMac: e.target.value || undefined })}
                placeholder="AA:BB:CC:DD:EE:FF"
              />
            </div>
            <div className={formStyles.row}>
              <div className={formStyles.field}>
                <div className={formStyles.label}>{t('reports.startTime')}</div>
                <input
                  className={formStyles.input}
                  type="datetime-local"
                  onChange={(e) => setSessionB({
                    ...sessionB,
                    startTime: e.target.value ? new Date(e.target.value).toISOString() : undefined,
                  })}
                />
              </div>
              <div className={formStyles.field}>
                <div className={formStyles.label}>{t('reports.endTime')}</div>
                <input
                  className={formStyles.input}
                  type="datetime-local"
                  onChange={(e) => setSessionB({
                    ...sessionB,
                    endTime: e.target.value ? new Date(e.target.value).toISOString() : undefined,
                  })}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.actions}>
        <button
          className={shellStyles.button}
          type="button"
          disabled={loading || !projectId}
          onClick={() => void handleCompare()}
        >
          {loading ? t('common.loading') : t('compare.compare')}
        </button>
      </div>

      {error && <div className={formStyles.error}>{error}</div>}

      {result && (
        <div className={styles.resultSection}>
          <div className={styles.summaryCard}>
            <div className={styles.sectionTitle}>{t('compare.summary')}</div>
            <div className={styles.summaryGrid}>
              <div className={styles.summaryItem}>
                <div className={styles.summaryLabel}>{t('compare.sessionA')}</div>
                <div className={styles.summaryValue}>{result.summary.aEventCount} events</div>
                <div className={styles.summarySubValue}>{result.summary.aErrorCount} errors</div>
              </div>
              <div className={styles.summaryItem}>
                <div className={styles.summaryLabel}>{t('compare.sessionB')}</div>
                <div className={styles.summaryValue}>{result.summary.bEventCount} events</div>
                <div className={styles.summarySubValue}>{result.summary.bErrorCount} errors</div>
              </div>
              <div className={styles.summaryItem}>
                <div className={styles.summaryLabel}>{t('compare.eventTypes')}</div>
                <div className={styles.summaryValue}>
                  {result.summary.commonEventTypes} {t('compare.common')}
                </div>
                <div className={styles.summarySubValue}>
                  {result.summary.diffEventTypes} diff
                </div>
              </div>
            </div>
          </div>

          <div className={styles.eventTypesCard}>
            <div className={styles.sectionTitle}>{t('compare.eventTypes')}</div>
            <div className={styles.eventTypesGrid}>
              <div className={styles.eventTypeColumn}>
                <div className={styles.eventTypeLabel} style={{ color: '#22c55e' }}>
                  {t('compare.common')} ({result.eventTypes.common.length})
                </div>
                <div className={styles.eventTypeList}>
                  {result.eventTypes.common.slice(0, 10).map((name) => (
                    <span key={name} className={styles.eventTag} style={{ borderColor: '#22c55e' }}>
                      {name}
                    </span>
                  ))}
                  {result.eventTypes.common.length > 10 && (
                    <span className={styles.moreTag}>+{result.eventTypes.common.length - 10}</span>
                  )}
                </div>
              </div>
              <div className={styles.eventTypeColumn}>
                <div className={styles.eventTypeLabel} style={{ color: '#3b82f6' }}>
                  {t('compare.onlyInA')} ({result.eventTypes.onlyInA.length})
                </div>
                <div className={styles.eventTypeList}>
                  {result.eventTypes.onlyInA.slice(0, 10).map((name) => (
                    <span key={name} className={styles.eventTag} style={{ borderColor: '#3b82f6' }}>
                      {name}
                    </span>
                  ))}
                  {result.eventTypes.onlyInA.length > 10 && (
                    <span className={styles.moreTag}>+{result.eventTypes.onlyInA.length - 10}</span>
                  )}
                </div>
              </div>
              <div className={styles.eventTypeColumn}>
                <div className={styles.eventTypeLabel} style={{ color: '#f59e0b' }}>
                  {t('compare.onlyInB')} ({result.eventTypes.onlyInB.length})
                </div>
                <div className={styles.eventTypeList}>
                  {result.eventTypes.onlyInB.slice(0, 10).map((name) => (
                    <span key={name} className={styles.eventTag} style={{ borderColor: '#f59e0b' }}>
                      {name}
                    </span>
                  ))}
                  {result.eventTypes.onlyInB.length > 10 && (
                    <span className={styles.moreTag}>+{result.eventTypes.onlyInB.length - 10}</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className={styles.timelineCard}>
            <div className={styles.sectionTitle}>{t('compare.timeline')}</div>
            <div className={styles.timelineHeader}>
              <div className={styles.timelineColA}>{t('compare.sessionA')}</div>
              <div className={styles.timelineColB}>{t('compare.sessionB')}</div>
            </div>
            <div className={styles.timelineList}>
              {result.timeline.map((item, idx) => (
                <div
                  key={idx}
                  className={`${styles.timelineRow} ${styles[`status_${item.status}`]}`}
                >
                  <div className={styles.timelineColA}>
                    {item.eventA ? (
                      <span style={{ color: getLevelColor(item.eventA.level) }}>
                        {item.eventA.eventName}
                      </span>
                    ) : (
                      <span className={styles.emptyCell}>-</span>
                    )}
                  </div>
                  <div className={styles.timelineColB}>
                    {item.eventB ? (
                      <span style={{ color: getLevelColor(item.eventB.level) }}>
                        {item.eventB.eventName}
                      </span>
                    ) : (
                      <span className={styles.emptyCell}>-</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
