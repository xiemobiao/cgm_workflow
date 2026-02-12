/**
 * Type Definitions for Event Flow Analysis Results
 */

// ========== Main Flow Analysis Types ==========

/**
 * Main flow analysis result
 */
export type MainFlowAnalysisResult = {
  templateId: string;
  templateName: string;
  totalSessions: number; // Total number of sessions analyzed
  completedSessions: number; // Sessions that completed the entire flow
  completionRate: number; // Completion rate (0-100)
  avgTotalDurationMs: number | null; // Average total duration for completed sessions

  stages: StageAnalysisResult[];
  sampleSessions: SessionAnalysis[];
};

/**
 * Stage analysis result
 */
export type StageAnalysisResult = {
  stageId: string;
  stageName: string;
  required: boolean;
  maxDurationMs: number | null;

  sessionsCovered: number; // Number of sessions that reached this stage
  coverageRate: number; // Coverage rate (0-100)
  avgDurationMs: number | null;
  maxObservedDurationMs: number | null;
  minDurationMs: number | null;

  events: EventAnalysisResult[];
  issues: StageIssue[]; // Detected issues in this stage
};

/**
 * Event analysis result within a stage
 */
export type EventAnalysisResult = {
  eventName: string;
  required: boolean;
  occurrenceCount: number; // How many times this event appeared
  sessionHitCount: number; // How many sessions had this event
  missedCount: number; // How many sessions missed this event
  hitRate: number; // Session hit rate (0-100)
};

/**
 * Stage issue (timeout, missing required events, etc.)
 */
export type StageIssue = {
  type: 'timeout' | 'missing_event' | 'failure_event';
  severity: number; // 1-5
  description: string;
  affectedSessions: string[]; // linkCodes
};

/**
 * Session analysis (sample session)
 */
export type SessionAnalysis = {
  linkCode: string;
  deviceMac: string | null;
  totalDurationMs: number | null;
  completed: boolean; // Did it complete the entire flow?
  stagesCompleted: number;
  coverageRate: number; // 0-100

  stageTimings: StageTiming[];
  missedEvents: string[]; // Event names that were expected but not found
};

/**
 * Stage timing within a session
 */
export type StageTiming = {
  stageId: string;
  stageName: string;
  startTime: number | null; // Timestamp in ms
  endTime: number | null;
  durationMs: number | null;
  attemptDurationsMs: number[]; // All matched start->end attempt durations
  completed: boolean;
  events: Array<{
    eventName: string;
    timestampMs: number;
  }>;
};

// ========== Event Coverage Analysis Types ==========

/**
 * Event coverage analysis result
 */
export type EventCoverageAnalysisResult = {
  totalEvents: number; // Total events in the log file
  knownEventsCount: number; // Total number of known events (54)

  summary: {
    coveredCount: number; // How many known events appeared
    missingCount: number; // How many known events are missing
    coverageRate: number; // Coverage rate (0-100)
  };

  byCategory: CategoryCoverageResult[];
  extraEvents: ExtraEventResult[]; // Events not in the known list
};

/**
 * Coverage result by category
 */
export type CategoryCoverageResult = {
  category: string;
  totalCount: number; // Total known events in this category
  coveredCount: number;
  missingCount: number;
  coverageRate: number; // 0-100

  events: EventCoverageResult[];
};

/**
 * Event coverage result
 */
export type EventCoverageResult = {
  eventName: string;
  level: string;
  description: string;
  covered: boolean; // Did this event appear in the log?
  occurrenceCount: number; // How many times it appeared
};

/**
 * Extra event (not in the known list)
 */
export type ExtraEventResult = {
  eventName: string;
  occurrenceCount: number;
};
