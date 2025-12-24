'use client';

import { useMemo } from 'react';
import styles from './BluetoothTimeline.module.css';

export interface TimelinePhase {
  name: string;
  startMs: number;
  endMs: number | null;
  status: 'success' | 'error' | 'timeout' | 'pending';
  events: Array<{
    id: string;
    eventName: string;
    timestampMs: number;
    level: number;
    msg: string | null;
  }>;
}

interface Props {
  phases: TimelinePhase[];
  sessionStartMs: number;
  sessionEndMs: number | null;
}

const PHASE_LABELS: Record<string, string> = {
  scan: 'Scan',
  pair: 'Pair',
  connect: 'Connect',
  connected: 'Connected',
  communicate: 'Communicate',
  disconnect: 'Disconnect',
};

const PHASE_COLORS: Record<string, string> = {
  scan: '#3b82f6',
  pair: '#8b5cf6',
  connect: '#06b6d4',
  connected: '#22c55e',
  communicate: '#10b981',
  disconnect: '#6b7280',
};

function getStatusColor(status: string): string {
  switch (status) {
    case 'success': return '#22c55e';
    case 'error': return '#ef4444';
    case 'timeout': return '#f59e0b';
    case 'pending': return '#6b7280';
    default: return '#6b7280';
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

export function BluetoothTimeline({ phases, sessionStartMs, sessionEndMs }: Props) {
  const totalDuration = useMemo(() => {
    if (!sessionEndMs) return null;
    return sessionEndMs - sessionStartMs;
  }, [sessionStartMs, sessionEndMs]);

  if (phases.length === 0) {
    return (
      <div className={styles.empty}>
        No timeline phases detected
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Horizontal Phase Bar */}
      <div className={styles.phaseBar}>
        {phases.map((phase, index) => {
          const phaseDuration = phase.endMs ? phase.endMs - phase.startMs : null;
          const widthPercent = totalDuration && phaseDuration
            ? Math.max(10, (phaseDuration / totalDuration) * 100)
            : 100 / phases.length;

          return (
            <div
              key={`${phase.name}-${index}`}
              className={styles.phase}
              style={{
                width: `${widthPercent}%`,
                backgroundColor: PHASE_COLORS[phase.name] ?? '#6b7280',
                borderColor: getStatusColor(phase.status),
              }}
            >
              <div className={styles.phaseLabel}>
                {PHASE_LABELS[phase.name] ?? phase.name}
              </div>
              <div className={styles.phaseDuration}>
                {phaseDuration ? formatDuration(phaseDuration) : '-'}
              </div>
              <div
                className={styles.phaseStatus}
                style={{ color: getStatusColor(phase.status) }}
              >
                {phase.status === 'success' ? 'OK' : phase.status.toUpperCase()}
              </div>
              <div className={styles.phaseEventCount}>
                {phase.events.length} events
              </div>
            </div>
          );
        })}
      </div>

      {/* Connection Flow Arrow */}
      <div className={styles.flowArrow}>
        {phases.map((phase, index) => (
          <div key={`arrow-${index}`} className={styles.flowItem}>
            <div
              className={styles.flowDot}
              style={{ backgroundColor: PHASE_COLORS[phase.name] ?? '#6b7280' }}
            />
            {index < phases.length - 1 && <div className={styles.flowLine} />}
          </div>
        ))}
      </div>

      {/* Phase Details */}
      <div className={styles.phaseDetails}>
        {phases.map((phase, index) => (
          <div key={`detail-${index}`} className={styles.phaseDetail}>
            <div className={styles.detailHeader}>
              <span
                className={styles.detailDot}
                style={{ backgroundColor: PHASE_COLORS[phase.name] ?? '#6b7280' }}
              />
              <span className={styles.detailName}>
                {PHASE_LABELS[phase.name] ?? phase.name}
              </span>
              <span
                className={styles.detailStatus}
                style={{ backgroundColor: getStatusColor(phase.status) }}
              >
                {phase.status}
              </span>
            </div>
            <div className={styles.detailTime}>
              {new Date(phase.startMs).toLocaleTimeString()}
              {phase.endMs && ` - ${new Date(phase.endMs).toLocaleTimeString()}`}
            </div>
            {phase.events.slice(0, 3).map((event) => (
              <div key={event.id} className={styles.detailEvent}>
                <span className={styles.eventLevel} data-level={event.level}>
                  L{event.level}
                </span>
                <span className={styles.eventName}>{event.eventName}</span>
              </div>
            ))}
            {phase.events.length > 3 && (
              <div className={styles.detailMore}>
                +{phase.events.length - 3} more events
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
