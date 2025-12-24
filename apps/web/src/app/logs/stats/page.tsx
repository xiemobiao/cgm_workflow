'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import shellStyles from '@/components/AppShell.module.css';
import formStyles from '@/components/Form.module.css';
import { ProjectPicker } from '@/components/ProjectPicker';
import { ApiClientError, apiFetch } from '@/lib/api';
import { getProjectId } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';

type StatsResponse = {
  totalEvents: number;
  byEventName: { eventName: string; count: number }[];
  byLevel: { level: number; count: number }[];
  errorRate: number;
};

type ErrorHotspot = {
  eventName: string;
  errorCode: string | null;
  count: number;
  lastSeenMs: number | null;
};

type ErrorHotspotsResponse = {
  items: ErrorHotspot[];
};

function formatDatetimeLocal(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toIsoFromDatetimeLocal(value: string) {
  const d = new Date(value);
  return d.toISOString();
}

function getLevelLabel(level: number): string {
  switch (level) {
    case 1: return 'INFO';
    case 2: return 'DEBUG';
    case 3: return 'WARN';
    case 4: return 'ERROR';
    default: return `L${level}`;
  }
}

function getLevelColor(level: number): string {
  switch (level) {
    case 1: return '#3b82f6';
    case 2: return '#22c55e';
    case 3: return '#f59e0b';
    case 4: return '#ef4444';
    default: return '#6b7280';
  }
}

export default function StatsPage() {
  const { localeTag, t } = useI18n();
  const [projectId, setProjectId] = useState('');
  const [logFileId, setLogFileId] = useState('');
  const [startLocal, setStartLocal] = useState('');
  const [endLocal, setEndLocal] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [hotspots, setHotspots] = useState<ErrorHotspotsResponse | null>(null);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setProjectId(getProjectId() ?? '');
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    const now = new Date();
    setEndLocal(formatDatetimeLocal(now));
    setStartLocal(formatDatetimeLocal(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)));
  }, []);

  async function loadStats() {
    if (!projectId) return;
    setLoading(true);
    setError('');

    try {
      const qs = new URLSearchParams({ projectId });
      if (logFileId.trim()) qs.set('logFileId', logFileId.trim());
      if (startLocal) qs.set('startTime', toIsoFromDatetimeLocal(startLocal));
      if (endLocal) qs.set('endTime', toIsoFromDatetimeLocal(endLocal));

      const [statsData, hotspotsData] = await Promise.all([
        apiFetch<StatsResponse>(`/api/logs/stats?${qs.toString()}`),
        startLocal && endLocal
          ? apiFetch<ErrorHotspotsResponse>(
              `/api/logs/stats/errors?projectId=${projectId}&startTime=${toIsoFromDatetimeLocal(startLocal)}&endTime=${toIsoFromDatetimeLocal(endLocal)}`
            )
          : Promise.resolve({ items: [] }),
      ]);

      setStats(statsData);
      setHotspots(hotspotsData);
    } catch (e: unknown) {
      const msg = e instanceof ApiClientError ? `${e.code}: ${e.message}` : String(e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  const maxEventCount = stats?.byEventName.reduce((max, e) => Math.max(max, e.count), 0) ?? 1;

  return (
    <div className={shellStyles.grid}>
      <div className={shellStyles.card}>
        <div className={formStyles.row} style={{ justifyContent: 'space-between' }}>
          <h1 style={{ fontSize: 20, marginBottom: 0 }}>{t('logs.stats')}</h1>
          <Link href="/logs" className={shellStyles.button}>
            {t('common.back')}
          </Link>
        </div>
        <div className={formStyles.row}>
          <ProjectPicker projectId={projectId} onChange={setProjectId} />
        </div>

        <div className={formStyles.row}>
          <div className={formStyles.field} style={{ minWidth: 280 }}>
            <div className={formStyles.label}>{t('logs.logFileIdOptional')}</div>
            <input
              className={formStyles.input}
              value={logFileId}
              onChange={(e) => setLogFileId(e.target.value)}
              placeholder="Filter by logFileId (optional)"
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
          <button
            className={shellStyles.button}
            type="button"
            disabled={!projectId || loading}
            onClick={() => void loadStats()}
          >
            {loading ? t('common.loading') : t('common.refresh')}
          </button>
        </div>

        {error && <div className={formStyles.error}>{error}</div>}
      </div>

      {stats && (
        <>
          {/* Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
            <div className={shellStyles.card} style={{ textAlign: 'center' }}>
              <div className={formStyles.muted} style={{ marginBottom: 8 }}>Total Events</div>
              <div style={{ fontSize: 32, fontWeight: 700 }}>{stats.totalEvents.toLocaleString()}</div>
            </div>
            <div className={shellStyles.card} style={{ textAlign: 'center' }}>
              <div className={formStyles.muted} style={{ marginBottom: 8 }}>Error Rate</div>
              <div style={{ fontSize: 32, fontWeight: 700, color: stats.errorRate > 5 ? '#ef4444' : stats.errorRate > 1 ? '#f59e0b' : '#22c55e' }}>
                {stats.errorRate}%
              </div>
            </div>
            <div className={shellStyles.card} style={{ textAlign: 'center' }}>
              <div className={formStyles.muted} style={{ marginBottom: 8 }}>Event Types</div>
              <div style={{ fontSize: 32, fontWeight: 700 }}>{stats.byEventName.length}</div>
            </div>
          </div>

          {/* Level Distribution */}
          <div className={shellStyles.card}>
            <h2 style={{ fontSize: 16, marginBottom: 16 }}>Level Distribution</h2>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {stats.byLevel.map((item) => (
                <div
                  key={item.level}
                  style={{
                    padding: '12px 20px',
                    borderRadius: 8,
                    backgroundColor: getLevelColor(item.level) + '20',
                    border: `2px solid ${getLevelColor(item.level)}`,
                    textAlign: 'center',
                    minWidth: 100,
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 600, color: getLevelColor(item.level) }}>
                    {getLevelLabel(item.level)}
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>
                    {item.count.toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Top Events */}
          <div className={shellStyles.card}>
            <h2 style={{ fontSize: 16, marginBottom: 16 }}>Top Events (by count)</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {stats.byEventName.slice(0, 20).map((item) => (
                <div key={item.eventName} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 200, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.eventName}
                  </div>
                  <div style={{ flex: 1, height: 20, backgroundColor: '#f3f4f6', borderRadius: 4, overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${(item.count / maxEventCount) * 100}%`,
                        backgroundColor: '#3b82f6',
                        borderRadius: 4,
                      }}
                    />
                  </div>
                  <div style={{ width: 80, textAlign: 'right', fontSize: 14, color: '#6b7280' }}>
                    {item.count.toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Error Hotspots */}
          {hotspots && hotspots.items.length > 0 && (
            <div className={shellStyles.card}>
              <h2 style={{ fontSize: 16, marginBottom: 16, color: '#ef4444' }}>Error Hotspots</h2>
              <div className={shellStyles.tableWrap}>
                <table className={shellStyles.table}>
                  <thead>
                    <tr>
                      <th>Event</th>
                      <th>Error Code</th>
                      <th>Count</th>
                      <th>Last Seen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hotspots.items.map((item, index) => (
                      <tr key={`${item.eventName}-${item.errorCode}-${index}`}>
                        <td style={{ fontWeight: 500 }}>{item.eventName}</td>
                        <td>
                          {item.errorCode ? (
                            <span className={`${shellStyles.badge} ${shellStyles.badgeDanger}`}>
                              {item.errorCode}
                            </span>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td>{item.count.toLocaleString()}</td>
                        <td className={formStyles.muted}>
                          {item.lastSeenMs ? new Date(item.lastSeenMs).toLocaleString(localeTag) : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {stats && stats.totalEvents === 0 && (
        <div className={shellStyles.card}>
          <div className={formStyles.muted}>{t('logs.empty')}</div>
        </div>
      )}
    </div>
  );
}
