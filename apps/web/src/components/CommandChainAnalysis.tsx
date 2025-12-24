'use client';

import { useMemo } from 'react';
import styles from './CommandChainAnalysis.module.css';

export interface CommandStats {
  total: number;
  success: number;
  timeout: number;
  error: number;
  pending: number;
  avgDurationMs: number | null;
  p50: number | null;
  p90: number | null;
  p99: number | null;
  slowest: Array<{
    requestId: string;
    durationMs: number | null;
    status: string;
  }>;
}

export interface CommandChain {
  requestId: string;
  startMs: number;
  endMs: number | null;
  durationMs: number | null;
  status: 'success' | 'timeout' | 'error' | 'pending';
  eventCount: number;
  events: Array<{
    id: string;
    eventName: string;
    timestampMs: number;
    level: number;
  }>;
}

interface Props {
  stats: CommandStats;
  chains: CommandChain[];
  onChainClick?: (chain: CommandChain) => void;
}

function formatDuration(ms: number | null): string {
  if (ms === null) return '-';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'success':
      return '#22c55e';
    case 'error':
      return '#ef4444';
    case 'timeout':
      return '#f59e0b';
    case 'pending':
      return '#3b82f6';
    default:
      return '#6b7280';
  }
}

function getPercentileColor(value: number | null, threshold: number): string {
  if (value === null) return '#6b7280';
  if (value > threshold * 2) return '#ef4444';
  if (value > threshold) return '#f59e0b';
  return '#22c55e';
}

export function CommandChainAnalysis({ stats, chains, onChainClick }: Props) {
  const successRate = useMemo(() => {
    if (stats.total === 0) return 0;
    return (stats.success / stats.total) * 100;
  }, [stats]);

  const statusDistribution = useMemo(() => {
    if (stats.total === 0) return [];
    return [
      { label: 'Success', count: stats.success, color: '#22c55e', percentage: (stats.success / stats.total) * 100 },
      { label: 'Error', count: stats.error, color: '#ef4444', percentage: (stats.error / stats.total) * 100 },
      { label: 'Timeout', count: stats.timeout, color: '#f59e0b', percentage: (stats.timeout / stats.total) * 100 },
      { label: 'Pending', count: stats.pending, color: '#3b82f6', percentage: (stats.pending / stats.total) * 100 },
    ].filter((s) => s.count > 0);
  }, [stats]);

  return (
    <div className={styles.container}>
      {/* Summary Cards */}
      <div className={styles.summaryGrid}>
        <div className={styles.summaryCard}>
          <div className={styles.summaryLabel}>Total Commands</div>
          <div className={styles.summaryValue}>{stats.total}</div>
        </div>
        <div className={styles.summaryCard}>
          <div className={styles.summaryLabel}>Success Rate</div>
          <div
            className={styles.summaryValue}
            style={{ color: successRate >= 90 ? '#22c55e' : successRate >= 70 ? '#f59e0b' : '#ef4444' }}
          >
            {successRate.toFixed(1)}%
          </div>
        </div>
        <div className={styles.summaryCard}>
          <div className={styles.summaryLabel}>Avg Duration</div>
          <div className={styles.summaryValue}>{formatDuration(stats.avgDurationMs)}</div>
        </div>
      </div>

      {/* Percentile Stats */}
      <div className={styles.percentileGrid}>
        <div className={styles.percentileCard}>
          <div className={styles.percentileHeader}>
            <span className={styles.percentileLabel}>P50</span>
            <span className={styles.percentileHint}>Median</span>
          </div>
          <div
            className={styles.percentileValue}
            style={{ color: getPercentileColor(stats.p50, 1000) }}
          >
            {formatDuration(stats.p50)}
          </div>
        </div>
        <div className={styles.percentileCard}>
          <div className={styles.percentileHeader}>
            <span className={styles.percentileLabel}>P90</span>
            <span className={styles.percentileHint}>90th percentile</span>
          </div>
          <div
            className={styles.percentileValue}
            style={{ color: getPercentileColor(stats.p90, 3000) }}
          >
            {formatDuration(stats.p90)}
          </div>
        </div>
        <div className={styles.percentileCard}>
          <div className={styles.percentileHeader}>
            <span className={styles.percentileLabel}>P99</span>
            <span className={styles.percentileHint}>99th percentile</span>
          </div>
          <div
            className={styles.percentileValue}
            style={{ color: getPercentileColor(stats.p99, 5000) }}
          >
            {formatDuration(stats.p99)}
          </div>
        </div>
      </div>

      {/* Status Distribution Bar */}
      {statusDistribution.length > 0 && (
        <div className={styles.distributionSection}>
          <div className={styles.sectionTitle}>Status Distribution</div>
          <div className={styles.distributionBar}>
            {statusDistribution.map((s) => (
              <div
                key={s.label}
                className={styles.distributionSegment}
                style={{
                  width: `${s.percentage}%`,
                  backgroundColor: s.color,
                }}
                title={`${s.label}: ${s.count} (${s.percentage.toFixed(1)}%)`}
              />
            ))}
          </div>
          <div className={styles.distributionLegend}>
            {statusDistribution.map((s) => (
              <div key={s.label} className={styles.legendItem}>
                <span
                  className={styles.legendDot}
                  style={{ backgroundColor: s.color }}
                />
                <span>{s.label}</span>
                <span className={styles.legendCount}>{s.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Slowest Commands */}
      {stats.slowest.length > 0 && (
        <div className={styles.slowestSection}>
          <div className={styles.sectionTitle}>Slowest Commands</div>
          <div className={styles.slowestList}>
            {stats.slowest.map((cmd, index) => (
              <div key={cmd.requestId} className={styles.slowestItem}>
                <span className={styles.slowestRank}>#{index + 1}</span>
                <span className={styles.slowestId}>{cmd.requestId}</span>
                <span
                  className={styles.slowestStatus}
                  style={{ backgroundColor: getStatusColor(cmd.status) }}
                >
                  {cmd.status}
                </span>
                <span className={styles.slowestDuration}>
                  {formatDuration(cmd.durationMs)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Command Chain List */}
      {chains.length > 0 && (
        <div className={styles.chainsSection}>
          <div className={styles.sectionTitle}>Recent Commands ({chains.length})</div>
          <div className={styles.chainsList}>
            {chains.slice(0, 20).map((chain) => (
              <div
                key={chain.requestId}
                className={styles.chainItem}
                onClick={() => onChainClick?.(chain)}
              >
                <div className={styles.chainHeader}>
                  <span className={styles.chainId}>{chain.requestId}</span>
                  <span
                    className={styles.chainStatus}
                    style={{ backgroundColor: getStatusColor(chain.status) }}
                  >
                    {chain.status}
                  </span>
                </div>
                <div className={styles.chainMeta}>
                  <span>{chain.eventCount} events</span>
                  <span>{formatDuration(chain.durationMs)}</span>
                  <span>{new Date(chain.startMs).toLocaleTimeString()}</span>
                </div>
                {chain.events.length > 0 && (
                  <div className={styles.chainEvents}>
                    {chain.events.slice(0, 3).map((event) => (
                      <span key={event.id} className={styles.chainEvent}>
                        {event.eventName}
                      </span>
                    ))}
                    {chain.events.length > 3 && (
                      <span className={styles.chainEventMore}>
                        +{chain.events.length - 3} more
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {chains.length === 0 && (
        <div className={styles.empty}>No command chains found in the selected time range.</div>
      )}
    </div>
  );
}
