'use client';

import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import shellStyles from '@/components/AppShell.module.css';
import formStyles from '@/components/Form.module.css';
import { BluetoothTimeline, type TimelinePhase } from '@/components/BluetoothTimeline';
import { ApiClientError, apiFetch } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

type SessionStatus =
  | 'scanning'
  | 'pairing'
  | 'connecting'
  | 'connected'
  | 'communicating'
  | 'disconnected'
  | 'timeout'
  | 'error';

type CommandChain = {
  requestId: string;
  events: Array<{
    id: string;
    eventName: string;
    timestampMs: number;
    level: number;
    msg: string | null;
  }>;
  startMs: number;
  endMs: number | null;
  durationMs: number | null;
  status: 'success' | 'pending' | 'error' | 'timeout';
  eventCount: number;
};

type SessionDetail = {
  session: {
    id: string;
    linkCode: string;
    deviceMac: string | null;
    startTimeMs: number;
    endTimeMs: number | null;
    durationMs: number | null;
    status: SessionStatus;
    eventCount: number;
    errorCount: number;
    commandCount: number;
    scanStartMs: number | null;
    pairStartMs: number | null;
    connectStartMs: number | null;
    connectedMs: number | null;
    disconnectMs: number | null;
    sdkVersion: string | null;
    appId: string | null;
    terminalInfo: string | null;
  };
  timeline: TimelinePhase[];
  commandChains: CommandChain[];
  events: Array<{
    id: string;
    eventName: string;
    timestampMs: number;
    level: number;
    msg: string | null;
  }>;
};

function formatDuration(ms: number | null): string {
  if (ms === null) return '-';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function getStatusColor(status: SessionStatus | CommandChain['status']): string {
  switch (status) {
    case 'connected':
    case 'communicating':
    case 'success':
      return '#22c55e';
    case 'disconnected':
      return '#6b7280';
    case 'error':
      return '#ef4444';
    case 'timeout':
      return '#f59e0b';
    case 'pending':
      return '#3b82f6';
    default:
      return '#3b82f6';
  }
}

function getStatusLabel(status: SessionStatus): string {
  const labels: Record<SessionStatus, string> = {
    scanning: 'Scanning',
    pairing: 'Pairing',
    connecting: 'Connecting',
    connected: 'Connected',
    communicating: 'Communicating',
    disconnected: 'Disconnected',
    timeout: 'Timeout',
    error: 'Error',
  };
  return labels[status] ?? status;
}

function getLevelColor(level: number): string {
  switch (level) {
    case 1:
      return '#3b82f6'; // DEBUG - blue
    case 2:
      return '#22c55e'; // INFO - green
    case 3:
      return '#f59e0b'; // WARN - amber
    case 4:
      return '#ef4444'; // ERROR - red
    default:
      return '#6b7280';
  }
}

function getLevelLabel(level: number): string {
  switch (level) {
    case 1:
      return 'DEBUG';
    case 2:
      return 'INFO';
    case 3:
      return 'WARN';
    case 4:
      return 'ERROR';
    default:
      return `L${level}`;
  }
}

type TabId = 'timeline' | 'commands' | 'events';

export default function SessionDetailPage() {
  const { localeTag, t } = useI18n();
  const params = useParams();
  const searchParams = useSearchParams();
  const linkCode = params.linkCode as string;
  const projectId = searchParams.get('projectId') ?? '';
  const logFileId = searchParams.get('logFileId')?.trim() ?? '';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('timeline');
  const [expandedCommands, setExpandedCommands] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!projectId || !linkCode) return;

    let cancelled = false;
    setLoading(true);
    setError('');

    const qs = new URLSearchParams({ projectId });
    if (logFileId) qs.set('logFileId', logFileId);

    apiFetch<SessionDetail>(`/api/logs/bluetooth/session/${encodeURIComponent(linkCode)}?${qs.toString()}`)
      .then((data) => {
        if (cancelled) return;
        setDetail(data);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const msg = e instanceof ApiClientError ? `${e.code}: ${e.message}` : String(e);
        setError(msg);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, linkCode, logFileId]);

  function toggleCommand(requestId: string) {
    setExpandedCommands((prev) => {
      const next = new Set(prev);
      if (next.has(requestId)) {
        next.delete(requestId);
      } else {
        next.add(requestId);
      }
      return next;
    });
  }

  if (!projectId) {
    return (
      <div className={shellStyles.grid}>
        <div className={shellStyles.card}>
          <div className={formStyles.error}>Missing projectId parameter</div>
          <Link href="/logs/bluetooth" className={shellStyles.button}>
            Back to Bluetooth Debug
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={shellStyles.grid}>
      {/* Header */}
      <div className={shellStyles.card}>
        <div className={formStyles.row} style={{ justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: 20, marginBottom: 4 }}>Session Detail</h1>
            <div className={formStyles.muted} style={{ fontFamily: 'monospace' }}>
              {decodeURIComponent(linkCode)}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Link
              href={`/logs/bluetooth?projectId=${projectId}${logFileId ? `&logFileId=${encodeURIComponent(logFileId)}` : ''}`}
              className={shellStyles.button}
            >
              Back to Sessions
            </Link>
            <Link
              href={`/logs?projectId=${projectId}&linkCode=${encodeURIComponent(linkCode)}${logFileId ? `&logFileId=${encodeURIComponent(logFileId)}` : ''}`}
              className={shellStyles.button}
            >
              View All Events
            </Link>
          </div>
        </div>

        {loading && <div className={formStyles.muted}>{t('common.loading')}</div>}
        {error && <div className={formStyles.error}>{error}</div>}

        {detail && (
          <div className={shellStyles.grid} style={{ marginTop: 16 }}>
            {/* Session Summary */}
            <div className={formStyles.row} style={{ gap: 24, flexWrap: 'wrap' }}>
              <div>
                <div className={formStyles.label}>Status</div>
                <span
                  className={shellStyles.badge}
                  style={{
                    backgroundColor: getStatusColor(detail.session.status),
                    color: '#fff',
                    fontSize: 14,
                    padding: '4px 12px',
                  }}
                >
                  {getStatusLabel(detail.session.status)}
                </span>
              </div>
              <div>
                <div className={formStyles.label}>Device MAC</div>
                <div style={{ fontFamily: 'monospace', fontSize: 14 }}>
                  {detail.session.deviceMac ?? 'Unknown'}
                </div>
              </div>
              <div>
                <div className={formStyles.label}>Duration</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>
                  {formatDuration(detail.session.durationMs)}
                </div>
              </div>
              <div>
                <div className={formStyles.label}>Start Time</div>
                <div style={{ fontSize: 14 }}>
                  {new Date(detail.session.startTimeMs).toLocaleString(localeTag)}
                </div>
              </div>
              <div>
                <div className={formStyles.label}>Events</div>
                <div style={{ fontSize: 14 }}>{detail.session.eventCount}</div>
              </div>
              <div>
                <div className={formStyles.label}>Errors</div>
                <div style={{ fontSize: 14, color: detail.session.errorCount > 0 ? '#ef4444' : undefined }}>
                  {detail.session.errorCount}
                </div>
              </div>
              <div>
                <div className={formStyles.label}>Commands</div>
                <div style={{ fontSize: 14 }}>{detail.session.commandCount}</div>
              </div>
              <div>
                <div className={formStyles.label}>SDK Version</div>
                <div style={{ fontSize: 14 }}>{detail.session.sdkVersion ?? '-'}</div>
              </div>
              <div>
                <div className={formStyles.label}>App ID</div>
                <div style={{ fontSize: 14 }}>{detail.session.appId ?? '-'}</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {detail && (
        <>
          {/* Tabs */}
          <div className={shellStyles.card}>
            <div className={formStyles.row} style={{ gap: 0 }}>
              {(['timeline', 'commands', 'events'] as const).map((tab) => (
                <button
                  key={tab}
                  className={shellStyles.button}
                  style={{
                    borderRadius: 0,
                    borderRight: tab !== 'events' ? 'none' : undefined,
                    backgroundColor: activeTab === tab ? 'var(--color-primary, #3b82f6)' : undefined,
                    color: activeTab === tab ? '#fff' : undefined,
                  }}
                  onClick={() => setActiveTab(tab)}
                >
                  {tab === 'timeline' && `Timeline (${detail.timeline.length} phases)`}
                  {tab === 'commands' && `Commands (${detail.commandChains.length})`}
                  {tab === 'events' && `Events (${detail.events.length})`}
                </button>
              ))}
            </div>
          </div>

          {/* Timeline Tab */}
          {activeTab === 'timeline' && (
            <div className={shellStyles.card}>
              <BluetoothTimeline
                phases={detail.timeline}
                sessionStartMs={detail.session.startTimeMs}
                sessionEndMs={detail.session.endTimeMs}
              />
            </div>
          )}

          {/* Commands Tab */}
          {activeTab === 'commands' && (
            <div className={shellStyles.card}>
              {detail.commandChains.length === 0 ? (
                <div className={formStyles.muted} style={{ padding: 20, textAlign: 'center' }}>
                  No command chains found in this session.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {detail.commandChains.map((chain) => (
                    <div
                      key={chain.requestId}
                      style={{
                        border: '1px solid var(--color-border, #e5e7eb)',
                        borderRadius: 8,
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          padding: '12px 16px',
                          backgroundColor: 'var(--color-bg-secondary, #f9fafb)',
                          cursor: 'pointer',
                        }}
                        onClick={() => toggleCommand(chain.requestId)}
                      >
                        <span style={{ fontFamily: 'monospace', fontSize: 12 }}>
                          {chain.requestId}
                        </span>
                        <span
                          className={shellStyles.badge}
                          style={{
                            backgroundColor: getStatusColor(chain.status),
                            color: '#fff',
                          }}
                        >
                          {chain.status.toUpperCase()}
                        </span>
                        <span className={formStyles.muted}>
                          {chain.events.length} events
                        </span>
                        <span style={{ fontWeight: 600 }}>
                          {formatDuration(chain.durationMs)}
                        </span>
                        <span className={formStyles.muted} style={{ marginLeft: 'auto' }}>
                          {new Date(chain.startMs).toLocaleTimeString(localeTag)}
                        </span>
                        <span style={{ fontSize: 12 }}>
                          {expandedCommands.has(chain.requestId) ? '\u25BC' : '\u25B6'}
                        </span>
                      </div>
                      {expandedCommands.has(chain.requestId) && (
                        <div style={{ padding: 16 }}>
                          <table className={shellStyles.table}>
                            <thead>
                              <tr>
                                <th>Time</th>
                                <th>Event</th>
                                <th>Level</th>
                                <th>Message</th>
                              </tr>
                            </thead>
                            <tbody>
                              {chain.events.map((event) => (
                                <tr key={event.id}>
                                  <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>
                                    {new Date(event.timestampMs).toLocaleTimeString(localeTag)}
                                  </td>
                                  <td>{event.eventName}</td>
                                  <td>
                                    <span
                                      style={{
                                        fontSize: 10,
                                        fontWeight: 600,
                                        padding: '2px 6px',
                                        borderRadius: 4,
                                        backgroundColor: getLevelColor(event.level),
                                        color: '#fff',
                                      }}
                                    >
                                      {getLevelLabel(event.level)}
                                    </span>
                                  </td>
                                  <td className={formStyles.muted} style={{ maxWidth: 400 }}>
                                    {event.msg
                                      ? event.msg.length > 100
                                        ? `${event.msg.slice(0, 100)}...`
                                        : event.msg
                                      : '-'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Events Tab */}
          {activeTab === 'events' && (
            <div className={shellStyles.card}>
              <div className={shellStyles.tableWrap}>
                <table className={shellStyles.table}>
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Event</th>
                      <th>Level</th>
                      <th>Message</th>
                      <th>ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.events.map((event) => (
                      <tr key={event.id}>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {new Date(event.timestampMs).toLocaleString(localeTag)}
                        </td>
                        <td>{event.eventName}</td>
                        <td>
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 600,
                              padding: '2px 6px',
                              borderRadius: 4,
                              backgroundColor: getLevelColor(event.level),
                              color: '#fff',
                            }}
                          >
                            {getLevelLabel(event.level)}
                          </span>
                        </td>
                        <td className={formStyles.muted} style={{ maxWidth: 500 }}>
                          {event.msg
                            ? event.msg.length > 150
                              ? `${event.msg.slice(0, 150)}...`
                              : event.msg
                            : '-'}
                        </td>
                        <td>
                          <Link
                            href={`/logs?projectId=${projectId}&eventId=${event.id}`}
                            style={{ color: 'var(--color-primary, #3b82f6)', fontSize: 12 }}
                          >
                            {event.id.slice(0, 8)}...
                          </Link>
                        </td>
                      </tr>
                    ))}
                    {detail.events.length === 0 && (
                      <tr>
                        <td colSpan={5} style={{ padding: 20, textAlign: 'center' }} className={formStyles.muted}>
                          No events found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
