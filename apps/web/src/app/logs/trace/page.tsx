'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import shellStyles from '@/components/AppShell.module.css';
import formStyles from '@/components/Form.module.css';
import { ProjectPicker } from '@/components/ProjectPicker';
import { ApiClientError, apiFetch } from '@/lib/api';
import { getProjectId } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';

type TraceItem = {
  id: string;
  eventName: string;
  level: number;
  timestampMs: number;
  sdkVersion: string | null;
  appId?: string | null;
  logFileId: string;
  threadName: string | null;
  deviceMac: string | null;
  linkCode?: string | null;
  requestId: string | null;
  errorCode: string | null;
  msg: string | null;
};

type TraceResponse = {
  linkCode?: string;
  requestId?: string;
  deviceMac?: string;
  count: number;
  items: TraceItem[];
};

type RelatedDevice = {
  deviceMac: string;
  eventCount: number;
  firstSeenMs: number | null;
  lastSeenMs: number | null;
};

type RelatedSession = {
  linkCode: string;
  eventCount: number;
  startTimeMs: number | null;
  endTimeMs: number | null;
};

type LinkCodeDevicesResponse = {
  linkCode: string;
  devices: RelatedDevice[];
};

type DeviceSessionsResponse = {
  deviceMac: string;
  sessions: RelatedSession[];
};

function formatDatetimeLocal(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toIsoFromDatetimeLocal(value: string) {
  const d = new Date(value);
  return d.toISOString();
}

function getLevelColor(level: number): string {
  switch (level) {
    case 1: return '#3b82f6'; // blue - INFO
    case 2: return '#22c55e'; // green - DEBUG
    case 3: return '#f59e0b'; // amber - WARN
    case 4: return '#ef4444'; // red - ERROR
    default: return '#6b7280'; // gray
  }
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

export default function TracePage() {
  const { localeTag, t } = useI18n();
  const [projectId, setProjectId] = useState('');
  const [traceType, setTraceType] = useState<'linkCode' | 'requestId' | 'deviceMac'>('linkCode');
  const [traceValue, setTraceValue] = useState('');
  const [startLocal, setStartLocal] = useState('');
  const [endLocal, setEndLocal] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<TraceResponse | null>(null);
  const [relatedDevices, setRelatedDevices] = useState<RelatedDevice[]>([]);
  const [relatedSessions, setRelatedSessions] = useState<RelatedSession[]>([]);
  const [relationLoading, setRelationLoading] = useState(false);

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

  async function trace() {
    if (!projectId || !traceValue.trim()) return;
    setLoading(true);
    setError('');
    setResult(null);
    setRelatedDevices([]);
    setRelatedSessions([]);

    try {
      let url = '';
      const qs = new URLSearchParams({ projectId });

      if (traceType === 'linkCode') {
        url = `/api/logs/trace/link-code/${encodeURIComponent(traceValue.trim())}`;
      } else if (traceType === 'requestId') {
        url = `/api/logs/trace/request-id/${encodeURIComponent(traceValue.trim())}`;
      } else if (traceType === 'deviceMac') {
        url = `/api/logs/trace/device/${encodeURIComponent(traceValue.trim())}`;
        if (startLocal && endLocal) {
          qs.set('startTime', toIsoFromDatetimeLocal(startLocal));
          qs.set('endTime', toIsoFromDatetimeLocal(endLocal));
        }
      }

      const data = await apiFetch<TraceResponse>(`${url}?${qs.toString()}`);
      setResult(data);

      // Fetch related devices/sessions
      setRelationLoading(true);
      try {
        if (traceType === 'linkCode') {
          const devicesData = await apiFetch<LinkCodeDevicesResponse>(
            `/api/logs/trace/link-code/${encodeURIComponent(traceValue.trim())}/devices?projectId=${projectId}`
          );
          setRelatedDevices(devicesData.devices);
        } else if (traceType === 'deviceMac' && startLocal && endLocal) {
          const sessionsQs = new URLSearchParams({
            projectId,
            startTime: toIsoFromDatetimeLocal(startLocal),
            endTime: toIsoFromDatetimeLocal(endLocal),
          });
          const sessionsData = await apiFetch<DeviceSessionsResponse>(
            `/api/logs/trace/device/${encodeURIComponent(traceValue.trim())}/sessions?${sessionsQs.toString()}`
          );
          setRelatedSessions(sessionsData.sessions);
        }
      } catch {
        // Ignore relation fetch errors
      } finally {
        setRelationLoading(false);
      }
    } catch (e: unknown) {
      const msg = e instanceof ApiClientError ? `${e.code}: ${e.message}` : String(e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={shellStyles.grid}>
      <div className={shellStyles.card}>
        <div className={formStyles.row} style={{ justifyContent: 'space-between' }}>
          <h1 style={{ fontSize: 20, marginBottom: 0 }}>{t('logs.trace')}</h1>
          <Link href="/logs" className={shellStyles.button}>
            {t('common.back')}
          </Link>
        </div>
        <div className={formStyles.row}>
          <ProjectPicker projectId={projectId} onChange={setProjectId} />
        </div>

        <div className={formStyles.row}>
          <div className={formStyles.field} style={{ minWidth: 140 }}>
            <div className={formStyles.label}>Trace Type</div>
            <select
              className={formStyles.select}
              value={traceType}
              onChange={(e) => setTraceType(e.target.value as 'linkCode' | 'requestId' | 'deviceMac')}
            >
              <option value="linkCode">linkCode</option>
              <option value="requestId">requestId</option>
              <option value="deviceMac">deviceMac</option>
            </select>
          </div>
          <div className={formStyles.field} style={{ minWidth: 300 }}>
            <div className={formStyles.label}>Value</div>
            <input
              className={formStyles.input}
              value={traceValue}
              onChange={(e) => setTraceValue(e.target.value)}
              placeholder={
                traceType === 'linkCode' ? 'e.g. abc123'
                  : traceType === 'requestId' ? 'e.g. req-001'
                    : 'e.g. AA:BB:CC:DD:EE:FF'
              }
            />
          </div>
          {traceType === 'deviceMac' && (
            <>
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
            </>
          )}
        </div>

        <div className={formStyles.row}>
          <button
            className={shellStyles.button}
            type="button"
            disabled={!projectId || !traceValue.trim() || loading}
            onClick={() => void trace()}
          >
            {loading ? t('common.loading') : t('logs.trace')}
          </button>
          {result && (
            <div className={formStyles.muted}>
              {t('common.items', { count: result.count })}
            </div>
          )}
        </div>

        {error && <div className={formStyles.error}>{error}</div>}
      </div>

      {/* Related Devices (for linkCode trace) */}
      {relatedDevices.length > 0 && (
        <div className={shellStyles.card}>
          <h2 style={{ fontSize: 16, marginBottom: 12 }}>{t('logs.trace.relatedDevices')}</h2>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {relatedDevices.map((device) => (
              <div
                key={device.deviceMac}
                className={shellStyles.card}
                style={{ padding: 12, minWidth: 200, cursor: 'pointer' }}
                onClick={() => {
                  setTraceType('deviceMac');
                  setTraceValue(device.deviceMac);
                }}
              >
                <div style={{ fontFamily: 'monospace', fontWeight: 600 }}>{device.deviceMac}</div>
                <div className={formStyles.muted} style={{ fontSize: 12, marginTop: 4 }}>
                  {t('common.events')}: {device.eventCount}
                </div>
                {device.firstSeenMs && device.lastSeenMs && (
                  <div className={formStyles.muted} style={{ fontSize: 11, marginTop: 2 }}>
                    {new Date(device.firstSeenMs).toLocaleString(localeTag)} ~ {new Date(device.lastSeenMs).toLocaleString(localeTag)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Related Sessions (for deviceMac trace) */}
      {relatedSessions.length > 0 && (
        <div className={shellStyles.card}>
          <h2 style={{ fontSize: 16, marginBottom: 12 }}>{t('logs.trace.relatedSessions')}</h2>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {relatedSessions.map((session) => (
              <div
                key={session.linkCode}
                className={shellStyles.card}
                style={{ padding: 12, minWidth: 200, cursor: 'pointer' }}
                onClick={() => {
                  setTraceType('linkCode');
                  setTraceValue(session.linkCode);
                }}
              >
                <div style={{ fontFamily: 'monospace', fontWeight: 600 }}>{session.linkCode}</div>
                <div className={formStyles.muted} style={{ fontSize: 12, marginTop: 4 }}>
                  {t('common.events')}: {session.eventCount}
                </div>
                {session.startTimeMs && session.endTimeMs && (
                  <div className={formStyles.muted} style={{ fontSize: 11, marginTop: 2 }}>
                    {new Date(session.startTimeMs).toLocaleString(localeTag)} ~ {new Date(session.endTimeMs).toLocaleString(localeTag)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {relationLoading && (
        <div className={shellStyles.card}>
          <div className={formStyles.muted}>{t('common.loading')}</div>
        </div>
      )}

      {result && result.items.length > 0 && (
        <div className={shellStyles.card}>
          <h2 style={{ fontSize: 16, marginBottom: 16 }}>Timeline</h2>
          <div style={{ position: 'relative', paddingLeft: 24 }}>
            {/* Timeline line */}
            <div
              style={{
                position: 'absolute',
                left: 8,
                top: 0,
                bottom: 0,
                width: 2,
                backgroundColor: '#e5e7eb',
              }}
            />

            {result.items.map((item, index) => (
              <div
                key={item.id}
                style={{
                  position: 'relative',
                  paddingBottom: index === result.items.length - 1 ? 0 : 16,
                  paddingLeft: 16,
                }}
              >
                {/* Timeline dot */}
                <div
                  style={{
                    position: 'absolute',
                    left: -16,
                    top: 4,
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    backgroundColor: getLevelColor(item.level),
                    border: '2px solid white',
                    boxShadow: '0 0 0 2px ' + getLevelColor(item.level) + '40',
                  }}
                />

                <div
                  style={{
                    backgroundColor: item.level >= 3 ? '#fef2f2' : '#f9fafb',
                    borderRadius: 8,
                    padding: '12px 16px',
                    border: `1px solid ${item.level >= 4 ? '#fecaca' : item.level >= 3 ? '#fde68a' : '#e5e7eb'}`,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        padding: '2px 6px',
                        borderRadius: 4,
                        backgroundColor: getLevelColor(item.level),
                        color: 'white',
                      }}
                    >
                      {getLevelLabel(item.level)}
                    </span>
                    <span style={{ fontWeight: 600 }}>{item.eventName}</span>
                    <span className={formStyles.muted} style={{ fontSize: 12 }}>
                      {new Date(item.timestampMs).toLocaleString(localeTag)}
                    </span>
                  </div>

                  {item.msg && (
                    <div className={formStyles.muted} style={{ marginBottom: 8 }}>
                      {item.msg}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12 }}>
                    {item.deviceMac && (
                      <span>
                        <strong>Device:</strong> {item.deviceMac}
                      </span>
                    )}
                    {item.requestId && (
                      <span>
                        <strong>ReqID:</strong> {item.requestId}
                      </span>
                    )}
                    {item.errorCode && (
                      <span style={{ color: '#ef4444' }}>
                        <strong>Error:</strong> {item.errorCode}
                      </span>
                    )}
                    {item.threadName && (
                      <span className={formStyles.muted}>
                        Thread: {item.threadName}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {result && result.items.length === 0 && (
        <div className={shellStyles.card}>
          <div className={formStyles.muted}>{t('logs.empty')}</div>
        </div>
      )}
    </div>
  );
}
