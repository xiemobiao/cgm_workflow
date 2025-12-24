'use client';

import styles from './AnomalyPatternList.module.css';

export interface AnomalyPattern {
  type: string;
  severity: number;
  description: string;
  suggestion: string;
  occurrences: number;
  affectedSessions: string[];
  timeWindowMs: number;
  sampleEvents: Array<{
    id: string;
    eventName: string;
    timestampMs: number;
  }>;
}

export interface AnomalySummary {
  totalAnomalies: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  affectedSessionsCount: number;
}

interface Props {
  anomalies: AnomalyPattern[];
  summary: AnomalySummary;
  recommendations: string[];
  onEventClick?: (eventId: string) => void;
  onSessionClick?: (linkCode: string) => void;
}

function getSeverityColor(severity: number): string {
  if (severity >= 5) return '#dc2626';
  if (severity >= 4) return '#ef4444';
  if (severity >= 3) return '#f59e0b';
  if (severity >= 2) return '#eab308';
  return '#6b7280';
}

function getSeverityLabel(severity: number): string {
  if (severity >= 5) return 'CRITICAL';
  if (severity >= 4) return 'HIGH';
  if (severity >= 3) return 'MEDIUM';
  if (severity >= 2) return 'LOW';
  return 'INFO';
}

function getTypeIcon(type: string): string {
  switch (type) {
    case 'frequent_disconnect':
      return '\u26A0';
    case 'timeout_retry':
      return '\u23F1';
    case 'error_burst':
      return '\u274C';
    case 'slow_connection':
      return '\u231B';
    case 'command_failure':
      return '\u2718';
    default:
      return '\u2139';
  }
}

function getTypeLabel(type: string): string {
  switch (type) {
    case 'frequent_disconnect':
      return 'Frequent Disconnect';
    case 'timeout_retry':
      return 'Timeout Retry';
    case 'error_burst':
      return 'Error Burst';
    case 'slow_connection':
      return 'Slow Connection';
    case 'command_failure':
      return 'Command Failure';
    default:
      return type;
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
}

export function AnomalyPatternList({
  anomalies,
  summary,
  recommendations,
  onEventClick,
  onSessionClick,
}: Props) {
  return (
    <div className={styles.container}>
      {/* Summary Cards */}
      <div className={styles.summaryGrid}>
        <div className={styles.summaryCard}>
          <div className={styles.summaryLabel}>Total Issues</div>
          <div className={styles.summaryValue}>{summary.totalAnomalies}</div>
        </div>
        <div className={styles.summaryCard} style={{ borderColor: '#dc2626' }}>
          <div className={styles.summaryLabel}>Critical</div>
          <div className={styles.summaryValue} style={{ color: '#dc2626' }}>
            {summary.criticalCount}
          </div>
        </div>
        <div className={styles.summaryCard} style={{ borderColor: '#ef4444' }}>
          <div className={styles.summaryLabel}>High</div>
          <div className={styles.summaryValue} style={{ color: '#ef4444' }}>
            {summary.highCount}
          </div>
        </div>
        <div className={styles.summaryCard} style={{ borderColor: '#f59e0b' }}>
          <div className={styles.summaryLabel}>Medium</div>
          <div className={styles.summaryValue} style={{ color: '#f59e0b' }}>
            {summary.mediumCount}
          </div>
        </div>
        <div className={styles.summaryCard}>
          <div className={styles.summaryLabel}>Affected Sessions</div>
          <div className={styles.summaryValue}>{summary.affectedSessionsCount}</div>
        </div>
      </div>

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <div className={styles.recommendationsSection}>
          <div className={styles.sectionTitle}>Recommendations</div>
          <div className={styles.recommendationsList}>
            {recommendations.map((rec, index) => (
              <div
                key={index}
                className={`${styles.recommendationItem} ${rec.startsWith('CRITICAL') ? styles.critical : ''} ${rec.startsWith('  -') ? styles.subItem : ''}`}
              >
                {rec}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Anomaly List */}
      <div className={styles.anomalyList}>
        {anomalies.map((anomaly, index) => (
          <div key={index} className={styles.anomalyCard}>
            <div className={styles.anomalyHeader}>
              <span className={styles.anomalyIcon}>{getTypeIcon(anomaly.type)}</span>
              <span className={styles.anomalyType}>{getTypeLabel(anomaly.type)}</span>
              <span
                className={styles.anomalySeverity}
                style={{ backgroundColor: getSeverityColor(anomaly.severity) }}
              >
                {getSeverityLabel(anomaly.severity)}
              </span>
            </div>

            <div className={styles.anomalyDescription}>{anomaly.description}</div>

            <div className={styles.anomalyMeta}>
              <span>{anomaly.occurrences} occurrences</span>
              <span>{anomaly.affectedSessions.length} sessions</span>
              <span>in {formatDuration(anomaly.timeWindowMs)}</span>
            </div>

            <div className={styles.anomalySuggestion}>
              <span className={styles.suggestionLabel}>Suggestion:</span>
              {anomaly.suggestion}
            </div>

            {anomaly.sampleEvents.length > 0 && (
              <div className={styles.sampleEvents}>
                <div className={styles.sampleLabel}>Sample Events:</div>
                <div className={styles.sampleList}>
                  {anomaly.sampleEvents.map((event) => (
                    <button
                      key={event.id}
                      className={styles.sampleEvent}
                      onClick={() => onEventClick?.(event.id)}
                    >
                      <span className={styles.sampleEventName}>{event.eventName}</span>
                      <span className={styles.sampleEventTime}>
                        {new Date(event.timestampMs).toLocaleTimeString()}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {anomaly.affectedSessions.length > 0 && (
              <div className={styles.affectedSessions}>
                <div className={styles.affectedLabel}>Affected Sessions:</div>
                <div className={styles.sessionList}>
                  {anomaly.affectedSessions.slice(0, 5).map((linkCode) => (
                    <button
                      key={linkCode}
                      className={styles.sessionLink}
                      onClick={() => onSessionClick?.(linkCode)}
                    >
                      {linkCode}
                    </button>
                  ))}
                  {anomaly.affectedSessions.length > 5 && (
                    <span className={styles.sessionMore}>
                      +{anomaly.affectedSessions.length - 5} more
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {anomalies.length === 0 && (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>\u2705</div>
          <div className={styles.emptyText}>No anomaly patterns detected</div>
          <div className={styles.emptyHint}>System is operating normally</div>
        </div>
      )}
    </div>
  );
}
