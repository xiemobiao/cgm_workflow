'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import shellStyles from '@/components/AppShell.module.css';
import formStyles from '@/components/Form.module.css';
import { ProjectPicker } from '@/components/ProjectPicker';
import { ApiClientError, apiFetch } from '@/lib/api';
import { getProjectId } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';

type CommandEvent = {
  id: string;
  eventName: string;
  level: number;
  timestampMs: number;
  errorCode: string | null;
  msg: string | null;
};

type CommandChain = {
  requestId: string;
  deviceMac: string | null;
  eventCount: number;
  startTime: number;
  endTime: number;
  duration: number;
  status: 'success' | 'timeout' | 'error' | 'pending';
  events: CommandEvent[];
};

type CommandChainsResponse = {
  count: number;
  items: CommandChain[];
};

function formatDatetimeLocal(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toIsoFromDatetimeLocal(value: string) {
  return new Date(value).toISOString();
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'success':
      return '#22c55e';
    case 'timeout':
      return '#f59e0b';
    case 'error':
      return '#ef4444';
    default:
      return '#6b7280';
  }
}

function getLevelColor(level: number): string {
  if (level >= 4) return '#ef4444';
  if (level >= 3) return '#f59e0b';
  if (level >= 2) return '#3b82f6';
  return '#22c55e';
}

export default function CommandsPage() {
  const { localeTag, t } = useI18n();
  const [projectId, setProjectId] = useState('');
  const [deviceMac, setDeviceMac] = useState('');
  const [startLocal, setStartLocal] = useState('');
  const [endLocal, setEndLocal] = useState('');
  const [limit, setLimit] = useState(100);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [chains, setChains] = useState<CommandChain[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setProjectId(getProjectId() ?? '');
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    const now = new Date();
    setEndLocal(formatDatetimeLocal(now));
    setStartLocal(formatDatetimeLocal(new Date(now.getTime() - 24 * 60 * 60 * 1000)));
  }, []);

  const canSearch = useMemo(() => Boolean(projectId && startLocal && endLocal), [projectId, startLocal, endLocal]);

  function setPresetRange(hours: number) {
    const now = new Date();
    setEndLocal(formatDatetimeLocal(now));
    setStartLocal(formatDatetimeLocal(new Date(now.getTime() - hours * 60 * 60 * 1000)));
  }

  async function search() {
    if (!projectId || !startLocal || !endLocal) return;
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams({
        projectId,
        startTime: toIsoFromDatetimeLocal(startLocal),
        endTime: toIsoFromDatetimeLocal(endLocal),
        limit: String(limit),
      });
      if (deviceMac.trim()) qs.set('deviceMac', deviceMac.trim());

      const data = await apiFetch<CommandChainsResponse>(`/api/logs/commands?${qs.toString()}`);
      setChains(data.items);
    } catch (e: unknown) {
      const msg = e instanceof ApiClientError ? `${e.code}: ${e.message}` : String(e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  // Statistics
  const stats = useMemo(() => {
    const total = chains.length;
    const success = chains.filter((c) => c.status === 'success').length;
    const timeout = chains.filter((c) => c.status === 'timeout').length;
    const errorCount = chains.filter((c) => c.status === 'error').length;
    const pending = chains.filter((c) => c.status === 'pending').length;
    const avgDuration = total > 0 ? chains.reduce((sum, c) => sum + c.duration, 0) / total : 0;
    return { total, success, timeout, error: errorCount, pending, avgDuration };
  }, [chains]);

  return (
    <div className={shellStyles.grid}>
      <div className={shellStyles.card}>
        <div className={formStyles.row} style={{ justifyContent: 'space-between' }}>
          <h1 style={{ fontSize: 20, marginBottom: 0 }}>{t('logs.commands')}</h1>
          <Link href="/logs" className={shellStyles.button}>
            {t('common.back')}
          </Link>
        </div>
        <p className={formStyles.muted} style={{ marginTop: 8 }}>
          {t('logs.commands.description')}
        </p>

        <div className={formStyles.row} style={{ marginTop: 16 }}>
          <ProjectPicker projectId={projectId} onChange={setProjectId} />
        </div>

        <div className={formStyles.row} style={{ marginTop: 12, flexWrap: 'wrap' }}>
          <div className={formStyles.field} style={{ minWidth: 200 }}>
            <div className={formStyles.label}>deviceMac ({t('common.optional')})</div>
            <input
              className={formStyles.input}
              value={deviceMac}
              onChange={(e) => setDeviceMac(e.target.value)}
              placeholder="e.g. AA:BB:CC:DD:EE:FF"
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
          <div className={formStyles.field} style={{ minWidth: 100 }}>
            <div className={formStyles.label}>{t('logs.limit')}</div>
            <input
              className={formStyles.input}
              type="number"
              min={1}
              max={500}
              value={limit}
              onChange={(e) => {
                const n = e.currentTarget.valueAsNumber;
                if (Number.isFinite(n)) setLimit(Math.min(Math.max(Math.trunc(n), 1), 500));
              }}
            />
          </div>
        </div>

        <div className={formStyles.row} style={{ marginTop: 12 }}>
          <button className={shellStyles.button} type="button" disabled={loading} onClick={() => setPresetRange(1)}>
            {t('logs.preset.1h')}
          </button>
          <button className={shellStyles.button} type="button" disabled={loading} onClick={() => setPresetRange(24)}>
            {t('logs.preset.24h')}
          </button>
          <button className={shellStyles.button} type="button" disabled={loading} onClick={() => setPresetRange(24 * 7)}>
            {t('logs.preset.7d')}
          </button>
          <button
            className={shellStyles.button}
            type="button"
            disabled={!canSearch || loading}
            onClick={() => void search()}
          >
            {t('common.search')}
          </button>
          <div className={formStyles.muted}>
            {loading ? t('common.loading') : t('common.items', { count: chains.length })}
          </div>
        </div>

        {error ? <div className={formStyles.error}>{error}</div> : null}
      </div>

      {chains.length > 0 && (
        <div className={shellStyles.card}>
          <h2 style={{ fontSize: 16, marginBottom: 12 }}>{t('logs.commands.stats')}</h2>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <div className={shellStyles.card} style={{ padding: 12, minWidth: 100 }}>
              <div className={formStyles.muted}>{t('logs.commands.total')}</div>
              <div style={{ fontSize: 20, fontWeight: 600 }}>{stats.total}</div>
            </div>
            <div className={shellStyles.card} style={{ padding: 12, minWidth: 100 }}>
              <div className={formStyles.muted}>{t('logs.commands.success')}</div>
              <div style={{ fontSize: 20, fontWeight: 600, color: '#22c55e' }}>{stats.success}</div>
            </div>
            <div className={shellStyles.card} style={{ padding: 12, minWidth: 100 }}>
              <div className={formStyles.muted}>{t('logs.commands.timeout')}</div>
              <div style={{ fontSize: 20, fontWeight: 600, color: '#f59e0b' }}>{stats.timeout}</div>
            </div>
            <div className={shellStyles.card} style={{ padding: 12, minWidth: 100 }}>
              <div className={formStyles.muted}>{t('logs.commands.error')}</div>
              <div style={{ fontSize: 20, fontWeight: 600, color: '#ef4444' }}>{stats.error}</div>
            </div>
            <div className={shellStyles.card} style={{ padding: 12, minWidth: 100 }}>
              <div className={formStyles.muted}>{t('logs.commands.pending')}</div>
              <div style={{ fontSize: 20, fontWeight: 600, color: '#6b7280' }}>{stats.pending}</div>
            </div>
            <div className={shellStyles.card} style={{ padding: 12, minWidth: 120 }}>
              <div className={formStyles.muted}>{t('logs.commands.avgDuration')}</div>
              <div style={{ fontSize: 20, fontWeight: 600 }}>{formatDuration(stats.avgDuration)}</div>
            </div>
          </div>
        </div>
      )}

      <div className={shellStyles.card}>
        <h2 style={{ fontSize: 16, marginBottom: 12 }}>{t('logs.commands.list')}</h2>
        <div className={shellStyles.tableWrap}>
          <table className={shellStyles.table}>
            <thead>
              <tr>
                <th>requestId</th>
                <th>deviceMac</th>
                <th>{t('logs.commands.events')}</th>
                <th>{t('logs.commands.duration')}</th>
                <th>{t('logs.commands.status')}</th>
                <th>{t('table.time')}</th>
              </tr>
            </thead>
            <tbody>
              {chains.map((chain) => (
                <>
                  <tr
                    key={chain.requestId}
                    className={shellStyles.clickableRow}
                    onClick={() => setExpandedId(expandedId === chain.requestId ? null : chain.requestId)}
                  >
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{chain.requestId}</td>
                    <td>{chain.deviceMac ?? '-'}</td>
                    <td>{chain.eventCount}</td>
                    <td>{formatDuration(chain.duration)}</td>
                    <td>
                      <span
                        className={shellStyles.badge}
                        style={{ backgroundColor: getStatusColor(chain.status), color: '#fff' }}
                      >
                        {chain.status}
                      </span>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {new Date(chain.startTime).toLocaleString(localeTag)}
                    </td>
                  </tr>
                  {expandedId === chain.requestId && (
                    <tr key={`${chain.requestId}-detail`}>
                      <td colSpan={6} style={{ padding: 0, background: 'var(--bg-muted, #f9fafb)' }}>
                        <div style={{ padding: 16 }}>
                          <h4 style={{ marginBottom: 8 }}>{t('logs.commands.eventChain')}</h4>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {chain.events.map((event, idx) => (
                              <div
                                key={event.id}
                                style={{
                                  display: 'flex',
                                  alignItems: 'flex-start',
                                  gap: 12,
                                  padding: 8,
                                  background: '#fff',
                                  borderRadius: 4,
                                  border: '1px solid var(--border, #e5e7eb)',
                                }}
                              >
                                <div
                                  style={{
                                    width: 8,
                                    height: 8,
                                    borderRadius: '50%',
                                    backgroundColor: getLevelColor(event.level),
                                    marginTop: 6,
                                    flexShrink: 0,
                                  }}
                                />
                                <div style={{ flex: 1 }}>
                                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                    <span style={{ fontWeight: 500 }}>{event.eventName}</span>
                                    {event.errorCode && (
                                      <span className={`${shellStyles.badge} ${shellStyles.badgeDanger}`}>
                                        {event.errorCode}
                                      </span>
                                    )}
                                    <span className={formStyles.muted} style={{ fontSize: 12 }}>
                                      {new Date(event.timestampMs).toLocaleString(localeTag)}
                                    </span>
                                    {idx > 0 && (
                                      <span className={formStyles.muted} style={{ fontSize: 12 }}>
                                        (+{event.timestampMs - chain.events[idx - 1].timestampMs}ms)
                                      </span>
                                    )}
                                  </div>
                                  {event.msg && (
                                    <div className={formStyles.muted} style={{ marginTop: 4, fontSize: 12 }}>
                                      {event.msg}
                                    </div>
                                  )}
                                </div>
                                <Link
                                  href={`/logs?q=${encodeURIComponent(event.eventName)}&startMs=${event.timestampMs - 60000}&endMs=${event.timestampMs + 60000}`}
                                  className={formStyles.muted}
                                  style={{ fontSize: 12 }}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {t('common.view')}
                                </Link>
                              </div>
                            ))}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
              {chains.length === 0 && !loading && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                    {t('common.noData')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
