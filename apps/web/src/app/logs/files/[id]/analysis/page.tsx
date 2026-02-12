'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock,
  FileText,
  RefreshCw,
  TrendingUp,
  AlertTriangle,
  Bug,
  Zap,
  BarChart3,
  LineChart,
  ListChecks,
  PlayCircle,
  ShieldCheck,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader, PageHeaderActionButton } from '@/components/ui/page-header';
import { ApiClientError, apiFetch } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { fadeIn } from '@/lib/animations';
import { getProjectId } from '@/lib/auth';

type AnalysisStatus = 'pending' | 'analyzing' | 'completed' | 'failed';

type LogFileAnalysis = {
  id: string;
  logFileId: string;
  qualityScore: number;
  bleQuality: {
    summary: {
      requiredTotal: number;
      okTotal: number;
      missingTotal: number;
      levelMismatchTotal: number;
      nameMismatchTotal: number;
      coverageRatio: number;
    };
    parser: {
      parserErrorCount: number;
      logan: {
        blocksTotal: number;
        blocksSucceeded: number;
        blocksFailed: number;
      } | null;
    };
  } | null;
  backendQuality: {
    http: {
      total: number;
      success: number;
      failed: number;
      successRate: number;
    };
    mqtt: {
      connected: number;
      disconnected: number;
      publishSuccess: number;
      publishFailed: number;
      ackSuccess: number;
      ackTimeout: number;
      ackFailed: number;
      issues: Array<{
        deviceSn: string;
        uploadSkippedNotConnected: number;
        publishFailed: number;
        ackFailed: number;
        ackTimeout: number;
      }>;
    };
  } | null;
  anomalies: Array<{
    type: string;
    severity: number;
    description: string;
    suggestion: string;
    occurrences: number;
    affectedSessions: string[];
    timeWindowMs: number;
  }>;
  knownIssueMatches: Array<{
    issueId: string;
    title: string;
    description: string;
    solution: string;
    category: string;
    severity: number;
    matchType: string;
    confidence: number;
    eventIds: string[];
  }>;
  totalEvents: number;
  errorEvents: number;
  warningEvents: number;
  sessionCount: number;
  deviceCount: number;
  status: AnalysisStatus;
  errorMessage: string | null;
  analyzedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type LogFileMeta = {
  id: string;
  projectId: string;
  fileName: string;
};

type AssertionRunStatus = 'running' | 'completed' | 'failed';

type AssertionRunItem = {
  id: string;
  projectId: string;
  logFileId: string;
  status: AssertionRunStatus;
  triggeredBy: string;
  totalRules: number | null;
  passedRules: number | null;
  failedRules: number | null;
  passRate: number | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  logFile: {
    fileName: string;
    uploadedAt: string;
  };
};

type AssertionRunsResponse = {
  items: AssertionRunItem[];
};

type InstallDefaultsResponse = {
  totalTemplates: number;
  createdCount: number;
  skippedCount: number;
  createdNames: string[];
  skippedNames: string[];
};

type AssertionValidationResponse = {
  runId: string;
  pass: boolean;
  totalRules: number;
  passedRules: number;
  failedRules: number;
  passRate: number;
};

type RegressionThresholds = {
  qualityScoreDropMax: number;
  errorRateIncreaseMax: number;
  errorEventsIncreaseMax: number;
  warningEventsIncreaseMax: number;
  sessionCountDropMax: number;
  deviceCountDropMax: number;
};

type RegressionSnapshot = {
  qualityScore: number;
  totalEvents: number;
  errorEvents: number;
  warningEvents: number;
  sessionCount: number;
  deviceCount: number;
  errorRate: number;
};

type RegressionBaselineItem = {
  id: string;
  projectId: string;
  logFileId: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  logFileName: string;
  logUploadedAt: string;
  snapshot: RegressionSnapshot;
  thresholds: RegressionThresholds;
};

type RegressionBaselinesResponse = {
  items: RegressionBaselineItem[];
};

type RegressionViolation = {
  metric: string;
  kind: 'drop' | 'increase';
  baselineValue: number;
  targetValue: number;
  delta: number;
  threshold: number;
  message: string;
};

type RegressionTrendItem = {
  logFileId: string;
  fileName: string;
  uploadedAt: string;
  analyzedAt: string | null;
  analysisCreatedAt: string;
  pass: boolean;
  violationCount: number;
  diff: {
    qualityScore: number;
    errorRate: number;
    errorEvents: number;
    warningEvents: number;
    sessionCount: number;
    deviceCount: number;
  };
  target: RegressionSnapshot;
  topViolations: RegressionViolation[];
};

type RegressionTrendResponse = {
  baseline: {
    id: string;
    logFileId: string;
    name: string;
    snapshot: RegressionSnapshot;
  };
  thresholds: RegressionThresholds;
  items: RegressionTrendItem[];
};

type ReasonCodeCategory =
  | 'timeout'
  | 'permission'
  | 'network'
  | 'bluetooth'
  | 'data'
  | 'session'
  | 'device'
  | 'unknown';

type ReasonCodeSummaryResponse = {
  logFileId: string;
  totalEvents: number;
  reasonCodeEvents: number;
  missingReasonCodeEvents: number;
  coverageRatio: number;
  uniqueReasonCodeCount: number;
  topReasonCodes: Array<{
    reasonCode: string;
    category: ReasonCodeCategory;
    count: number;
    ratio: number;
  }>;
  byCategory: Array<{
    category: ReasonCodeCategory;
    count: number;
    ratio: number;
    reasonCodeCount: number;
    topReasonCodes: Array<{
      reasonCode: string;
      count: number;
      ratio: number;
    }>;
  }>;
  topStageOpResults: Array<{
    stage: string | null;
    op: string | null;
    result: string | null;
    count: number;
    ratio: number;
    topReasonCodes: Array<{
      reasonCode: string;
      count: number;
      ratioWithinCombination: number;
    }>;
  }>;
};

type TranslateFn = (
  key: string,
  vars?: Record<string, string | number>
) => string;

function toErrorMessage(error: unknown) {
  return error instanceof ApiClientError
    ? `${error.code}: ${error.message}`
    : String(error);
}

function formatSigned(value: number, digits = 2) {
  const abs = Math.abs(value).toFixed(digits);
  if (value > 0) return `+${abs}`;
  if (value < 0) return `-${abs}`;
  return abs;
}

function getQualityColor(score: number) {
  if (score >= 80) return 'text-emerald-400';
  if (score >= 60) return 'text-amber-400';
  return 'text-red-400';
}

function getQualityBgClass(score: number) {
  if (score >= 80) return 'bg-emerald-500/10 border-emerald-500/20';
  if (score >= 60) return 'bg-amber-500/10 border-amber-500/20';
  return 'bg-red-500/10 border-red-500/20';
}

function getSeverityBadge(severity: number, t: TranslateFn) {
  if (severity >= 4) return <Badge variant="destructive">{t('logs.analysis.severity.critical')}</Badge>;
  if (severity >= 3) return <Badge variant="warning">{t('logs.analysis.severity.high')}</Badge>;
  if (severity >= 2) return <Badge variant="info">{t('logs.analysis.severity.medium')}</Badge>;
  return <Badge variant="secondary">{t('logs.analysis.severity.low')}</Badge>;
}

function getRunStatusBadge(status: AssertionRunStatus, t: TranslateFn) {
  if (status === 'completed') {
    return <Badge variant="outline">{t('logs.analysis.assertions.status.completed')}</Badge>;
  }
  if (status === 'running') {
    return <Badge variant="secondary">{t('logs.analysis.assertions.status.running')}</Badge>;
  }
  return <Badge variant="destructive">{t('logs.analysis.assertions.status.failed')}</Badge>;
}

function getTriggerModeLabel(mode: string, t: TranslateFn) {
  if (mode === 'manual') return t('logs.analysis.assertions.trigger.manual');
  if (mode === 'auto') return t('logs.analysis.assertions.trigger.auto');
  return mode;
}

function getReasonCategoryLabel(category: ReasonCodeCategory, t: TranslateFn) {
  if (category === 'timeout') return t('logs.analysis.reasonCode.category.timeout');
  if (category === 'permission') return t('logs.analysis.reasonCode.category.permission');
  if (category === 'network') return t('logs.analysis.reasonCode.category.network');
  if (category === 'bluetooth') return t('logs.analysis.reasonCode.category.bluetooth');
  if (category === 'data') return t('logs.analysis.reasonCode.category.data');
  if (category === 'session') return t('logs.analysis.reasonCode.category.session');
  if (category === 'device') return t('logs.analysis.reasonCode.category.device');
  return t('logs.analysis.reasonCode.category.unknown');
}

function buildLogsSearchHref(params: {
  projectId?: string;
  logFileId: string;
  reasonCode?: string;
  stage?: string | null;
  op?: string | null;
  result?: string | null;
}) {
  const qs = new URLSearchParams();
  if (params.projectId?.trim()) qs.set('projectId', params.projectId.trim());
  qs.set('logFileId', params.logFileId);
  if (params.reasonCode?.trim()) qs.set('reasonCode', params.reasonCode.trim());
  if (params.stage?.trim()) qs.set('stage', params.stage.trim());
  if (params.op?.trim()) qs.set('op', params.op.trim());
  if (params.result?.trim()) qs.set('result', params.result.trim());
  return `/logs?${qs.toString()}`;
}

export default function AnalysisPage() {
  const { localeTag, t } = useI18n();
  const params = useParams();
  const logFileId = params?.id as string | undefined;

  const [analysis, setAnalysis] = useState<LogFileAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retrying, setRetrying] = useState(false);
  const [projectId, setProjectId] = useState('');

  const [assertionRuns, setAssertionRuns] = useState<AssertionRunItem[]>([]);
  const [assertionLoading, setAssertionLoading] = useState(false);
  const [assertionError, setAssertionError] = useState('');
  const [assertionSummary, setAssertionSummary] = useState('');
  const [installingDefaults, setInstallingDefaults] = useState(false);
  const [runningAssertion, setRunningAssertion] = useState(false);

  const [regressionTrend, setRegressionTrend] =
    useState<RegressionTrendResponse | null>(null);
  const [regressionLoading, setRegressionLoading] = useState(false);
  const [regressionError, setRegressionError] = useState('');
  const [baselineHint, setBaselineHint] = useState('');

  const [reasonCodeSummary, setReasonCodeSummary] =
    useState<ReasonCodeSummaryResponse | null>(null);
  const [reasonCodeLoading, setReasonCodeLoading] = useState(false);
  const [reasonCodeError, setReasonCodeError] = useState('');

  useEffect(() => {
    if (!logFileId) return;
    let cancelled = false;

    async function fetchAnalysis() {
      setLoading(true);
      setError('');
      try {
        const data = await apiFetch<LogFileAnalysis>(
          `/api/logs/files/${logFileId}/analysis`
        );
        if (cancelled) return;
        setAnalysis(data);
      } catch (e: unknown) {
        if (cancelled) return;
        // If analysis not found (404), don't set error - show trigger button instead
        if (e instanceof ApiClientError && (e.status === 404 || e.code === 'ANALYSIS_NOT_FOUND')) {
          // Leave analysis as null to show "No analysis yet" UI
        } else {
          setError(toErrorMessage(e));
        }
      } finally {
        if (cancelled) return;
        setLoading(false);
      }
    }

    void fetchAnalysis();

    return () => {
      cancelled = true;
    };
  }, [logFileId]);

  useEffect(() => {
    if (!logFileId) return;
    let cancelled = false;
    const savedProjectId = getProjectId();
    if (savedProjectId) {
      setProjectId(savedProjectId);
    }
    apiFetch<LogFileMeta>(`/api/logs/files/${logFileId}`)
      .then((meta) => {
        if (cancelled) return;
        setProjectId(meta.projectId);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [logFileId]);

  const loadReasonCodeSummary = useCallback(async () => {
    if (!logFileId) return;
    setReasonCodeLoading(true);
    setReasonCodeError('');
    try {
      const data = await apiFetch<ReasonCodeSummaryResponse>(
        `/api/logs/files/${logFileId}/reason-codes`
      );
      setReasonCodeSummary(data);
    } catch (e: unknown) {
      setReasonCodeError(toErrorMessage(e));
      setReasonCodeSummary(null);
    } finally {
      setReasonCodeLoading(false);
    }
  }, [logFileId]);

  const loadAssertionRuns = useCallback(async (activeProjectId: string) => {
    if (!logFileId) return;
    setAssertionLoading(true);
    setAssertionError('');
    try {
      const qs = new URLSearchParams({
        projectId: activeProjectId,
        logFileId,
        limit: '10',
      });
      const data = await apiFetch<AssertionRunsResponse>(
        `/api/logs/assertions/runs?${qs.toString()}`
      );
      setAssertionRuns(data.items);
    } catch (e: unknown) {
      setAssertionError(toErrorMessage(e));
    } finally {
      setAssertionLoading(false);
    }
  }, [logFileId]);

  const loadRegressionTrend = useCallback(async (activeProjectId: string) => {
    if (!logFileId) return;
    setRegressionLoading(true);
    setRegressionError('');
    setBaselineHint('');
    try {
      const baselineQs = new URLSearchParams({
        projectId: activeProjectId,
        isActive: 'true',
        limit: '20',
      });
      const baselines = await apiFetch<RegressionBaselinesResponse>(
        `/api/logs/regression/baselines?${baselineQs.toString()}`
      );
      if (baselines.items.length === 0) {
        setRegressionTrend(null);
        setBaselineHint(t('logs.analysis.regression.baselineMissingHint'));
        return;
      }
      const preferred =
        baselines.items.find((item) => item.logFileId === logFileId) ??
        baselines.items[0];
      const trendQs = new URLSearchParams({
        projectId: activeProjectId,
        baselineId: preferred.id,
        limit: '12',
      });
      const trend = await apiFetch<RegressionTrendResponse>(
        `/api/logs/regression/trend?${trendQs.toString()}`
      );
      setRegressionTrend(trend);
    } catch (e: unknown) {
      setRegressionError(toErrorMessage(e));
      setRegressionTrend(null);
    } finally {
      setRegressionLoading(false);
    }
  }, [logFileId, t]);

  useEffect(() => {
    if (!logFileId) return;
    void loadReasonCodeSummary();
  }, [logFileId, loadReasonCodeSummary]);

  const refreshAutomationData = useCallback(async () => {
    if (!projectId || !logFileId) return;
    await Promise.all([
      loadAssertionRuns(projectId),
      loadRegressionTrend(projectId),
      loadReasonCodeSummary(),
    ]);
  }, [
    projectId,
    logFileId,
    loadAssertionRuns,
    loadRegressionTrend,
    loadReasonCodeSummary,
  ]);

  useEffect(() => {
    if (!projectId || !logFileId) return;
    void refreshAutomationData();
  }, [projectId, logFileId, refreshAutomationData]);

  // Auto-refresh if analyzing
  useEffect(() => {
    if (!analysis || analysis.status !== 'analyzing') return;

    const timer = window.setInterval(() => {
      if (!logFileId) return;
      apiFetch<LogFileAnalysis>(`/api/logs/files/${logFileId}/analysis`)
        .then((data) => setAnalysis(data))
        .catch(() => {});
    }, 2000);

    return () => window.clearInterval(timer);
  }, [analysis, logFileId]);

  async function triggerAnalysis() {
    if (!logFileId) return;
    setRetrying(true);
    try {
      await apiFetch(`/api/logs/files/${logFileId}/analyze`, {
        method: 'POST',
      });
      // Wait 1 second then refresh
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const data = await apiFetch<LogFileAnalysis>(
        `/api/logs/files/${logFileId}/analysis`
      );
      setAnalysis(data);
      await loadReasonCodeSummary();
      setError('');
    } catch (e: unknown) {
      setError(toErrorMessage(e));
    } finally {
      setRetrying(false);
    }
  }

  async function installDefaultRules() {
    if (!projectId) return;
    setInstallingDefaults(true);
    setAssertionError('');
    setAssertionSummary('');
    try {
      const result = await apiFetch<InstallDefaultsResponse>(
        '/api/logs/assertions/rules/install-defaults',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId }),
        }
      );
      setAssertionSummary(
        t('logs.analysis.assertions.summary.installDefaults', {
          created: result.createdCount,
          skipped: result.skippedCount,
        })
      );
    } catch (e: unknown) {
      setAssertionError(toErrorMessage(e));
    } finally {
      setInstallingDefaults(false);
    }
  }

  async function runAssertionValidation() {
    if (!projectId || !logFileId) return;
    setRunningAssertion(true);
    setAssertionError('');
    setAssertionSummary('');
    try {
      const result = await apiFetch<AssertionValidationResponse>(
        '/api/logs/assertions/validate',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId,
            logFileId,
            triggeredBy: 'manual',
          }),
        }
      );
      setAssertionSummary(
        result.pass
          ? t('logs.analysis.assertions.summary.pass', {
              passed: result.passedRules,
              total: result.totalRules,
              rate: result.passRate.toFixed(2),
            })
          : t('logs.analysis.assertions.summary.fail', {
              failed: result.failedRules,
              total: result.totalRules,
            })
      );
      await loadAssertionRuns(projectId);
    } catch (e: unknown) {
      setAssertionError(toErrorMessage(e));
    } finally {
      setRunningAssertion(false);
    }
  }

  if (!logFileId) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        {t('logs.analysis.invalidLogFileId')}
      </div>
    );
  }
  const logsHref = buildLogsSearchHref({ projectId, logFileId });

  return (
    <div className="mx-auto w-full max-w-[1560px] space-y-6 p-6">
      {/* Header */}
      <motion.div
        variants={fadeIn}
        initial="initial"
        animate="animate"
      >
        <PageHeader
          title={t('logs.analysis.title')}
          subtitle={t('logs.analysis.subtitle')}
          actions={(
            <>
              <PageHeaderActionButton asChild>
                <Link href={`/logs/files/${logFileId}`}>{t('logs.files.backToDetail')}</Link>
              </PageHeaderActionButton>
              <PageHeaderActionButton
                onClick={() => void triggerAnalysis()}
                disabled={retrying || loading}
                className="gap-2"
              >
                <RefreshCw size={16} className={retrying ? 'animate-spin' : ''} />
                {t('logs.analysis.actions.reanalyze')}
              </PageHeaderActionButton>
            </>
          )}
        />
      </motion.div>
      <motion.div variants={fadeIn} initial="initial" animate="animate">
        <div className="flex flex-wrap items-center gap-2 px-1">
          <span className="text-xs text-muted-foreground">{t('logs.files.quickLinks')}</span>
          <PageHeaderActionButton asChild className="h-7 rounded-full px-3 text-xs">
            <Link href={`/logs/files/${logFileId}/viewer`}>{t('logs.files.viewContent')}</Link>
          </PageHeaderActionButton>
          <PageHeaderActionButton asChild className="h-7 rounded-full px-3 text-xs">
            <Link href={logsHref}>{t('logs.files.openInLogs')}</Link>
          </PageHeaderActionButton>
          <PageHeaderActionButton asChild className="h-7 rounded-full px-3 text-xs">
            <Link href={`/logs/files/${logFileId}/event-flow`}>
              {t('logs.files.eventFlowAnalysis')}
            </Link>
          </PageHeaderActionButton>
        </div>
      </motion.div>

      {/* Loading State */}
      {loading && (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <Card className="glass border-destructive/50">
          <CardContent className="p-6">
            <div className="flex items-start gap-3">
              <AlertCircle size={24} className="text-destructive flex-shrink-0 mt-1" />
              <div className="flex-1">
                <h3 className="font-semibold text-destructive mb-2">
                  {t('logs.analysis.error.title')}
                </h3>
                <p className="text-sm text-muted-foreground">{error}</p>
                <PageHeaderActionButton
                  onClick={() => void triggerAnalysis()}
                  disabled={retrying}
                  className="mt-4"
                >
                  {t('logs.analysis.error.retryAnalysis')}
                </PageHeaderActionButton>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* No Analysis State */}
      {!analysis && !loading && !error && (
        <Card className="glass border-blue-500/50">
          <CardContent className="p-8 text-center">
            <div className="flex flex-col items-center gap-4">
              <BarChart3 size={48} className="text-blue-400" />
              <div>
                <h3 className="font-semibold text-lg mb-2">{t('logs.analysis.empty.title')}</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  {t('logs.analysis.empty.description')}
                </p>
                <Button
                  onClick={() => void triggerAnalysis()}
                  disabled={retrying}
                  className="gap-2"
                >
                  <RefreshCw size={16} className={retrying ? 'animate-spin' : ''} />
                  {t('logs.analysis.actions.startNow')}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Analysis Content */}
      {analysis && !loading && (
        <>
          {/* Status Banner */}
          {analysis.status === 'analyzing' && (
            <Card className="glass border-amber-500/50 bg-amber-500/5">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <RefreshCw size={20} className="text-amber-400 animate-spin" />
                  <div>
                    <p className="font-medium text-amber-400">
                      {t('logs.analysis.status.analyzingTitle')}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {t('logs.analysis.status.analyzingDescription')}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {analysis.status === 'failed' && (
            <Card className="glass border-destructive/50 bg-destructive/5">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <AlertCircle size={20} className="text-destructive" />
                  <div className="flex-1">
                    <p className="font-medium text-destructive">
                      {t('logs.analysis.status.failedTitle')}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {analysis.errorMessage || t('logs.analysis.status.unknownError')}
                    </p>
                  </div>
                  <PageHeaderActionButton
                    onClick={() => void triggerAnalysis()}
                    disabled={retrying}
                  >
                    {t('logs.analysis.actions.retry')}
                  </PageHeaderActionButton>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Quality Score Card */}
          <motion.div
            variants={fadeIn}
            initial="initial"
            animate="animate"
            transition={{ delay: 0.1 }}
          >
            <Card className={`glass border-2 ${getQualityBgClass(analysis.qualityScore)}`}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`p-4 rounded-full bg-background/50 ${getQualityColor(analysis.qualityScore)}`}>
                      <Activity size={32} />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-muted-foreground">
                        {t('logs.analysis.metrics.overallQualityScore')}
                      </h2>
                      <p className={`text-5xl font-bold ${getQualityColor(analysis.qualityScore)}`}>
                        {analysis.qualityScore}
                        <span className="text-2xl text-muted-foreground">/100</span>
                      </p>
                    </div>
                  </div>
                  <div className="text-right text-sm text-muted-foreground">
                    {analysis.analyzedAt && (
                      <div className="flex items-center gap-2">
                        <Clock size={14} />
                        {new Date(analysis.analyzedAt).toLocaleString(localeTag)}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Quick Metrics */}
          <motion.div
            variants={fadeIn}
            initial="initial"
            animate="animate"
            transition={{ delay: 0.2 }}
            className="grid grid-cols-2 md:grid-cols-5 gap-4"
          >
            <Card className="glass border-white/[0.08]">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <FileText size={20} className="text-blue-400" />
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {t('logs.analysis.metrics.totalEvents')}
                    </p>
                    <p className="text-2xl font-bold">{analysis.totalEvents.toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="glass border-white/[0.08]">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <AlertCircle size={20} className="text-red-400" />
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {t('logs.analysis.metrics.errors')}
                    </p>
                    <p className="text-2xl font-bold">{analysis.errorEvents.toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="glass border-white/[0.08]">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <AlertTriangle size={20} className="text-amber-400" />
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {t('logs.analysis.metrics.warnings')}
                    </p>
                    <p className="text-2xl font-bold">{analysis.warningEvents.toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="glass border-white/[0.08]">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <Activity size={20} className="text-emerald-400" />
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {t('logs.analysis.metrics.sessions')}
                    </p>
                    <p className="text-2xl font-bold">{analysis.sessionCount.toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="glass border-white/[0.08]">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <Zap size={20} className="text-purple-400" />
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {t('logs.analysis.metrics.devices')}
                    </p>
                    <p className="text-2xl font-bold">{analysis.deviceCount.toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Reason Code Classification */}
          <motion.div
            variants={fadeIn}
            initial="initial"
            animate="animate"
            transition={{ delay: 0.23 }}
          >
            <Card className="glass border-white/[0.08]">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle size={20} />
                  {t('logs.analysis.reasonCode.title')}
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  {t('logs.analysis.reasonCode.subtitle')}
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                {reasonCodeError && (
                  <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
                    {reasonCodeError}
                  </div>
                )}

                {reasonCodeLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                ) : reasonCodeSummary ? (
                  reasonCodeSummary.reasonCodeEvents === 0 ? (
                    <div className="rounded-md border border-border/60 bg-background/20 p-4 text-sm text-muted-foreground">
                      {t('logs.analysis.reasonCode.empty')}
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                        <div className="rounded-lg border border-border/50 bg-background/20 p-3">
                          <p className="text-xs text-muted-foreground">
                            {t('logs.analysis.reasonCode.totalTagged')}
                          </p>
                          <p className="text-xl font-semibold tabular-nums">
                            {reasonCodeSummary.reasonCodeEvents.toLocaleString()}
                          </p>
                        </div>
                        <div className="rounded-lg border border-border/50 bg-background/20 p-3">
                          <p className="text-xs text-muted-foreground">
                            {t('logs.analysis.reasonCode.coverage')}
                          </p>
                          <p className="text-xl font-semibold tabular-nums text-emerald-400">
                            {reasonCodeSummary.coverageRatio.toFixed(2)}%
                          </p>
                        </div>
                        <div className="rounded-lg border border-border/50 bg-background/20 p-3">
                          <p className="text-xs text-muted-foreground">
                            {t('logs.analysis.reasonCode.missing')}
                          </p>
                          <p className="text-xl font-semibold tabular-nums text-amber-400">
                            {reasonCodeSummary.missingReasonCodeEvents.toLocaleString()}
                          </p>
                        </div>
                        <div className="rounded-lg border border-border/50 bg-background/20 p-3">
                          <p className="text-xs text-muted-foreground">
                            {t('logs.analysis.reasonCode.unique')}
                          </p>
                          <p className="text-xl font-semibold tabular-nums">
                            {reasonCodeSummary.uniqueReasonCodeCount.toLocaleString()}
                          </p>
                        </div>
                      </div>

                      <div className="grid gap-4 lg:grid-cols-2">
                        <div className="rounded-lg border border-border/50 bg-background/20 p-3">
                          <p className="mb-2 text-sm font-medium">
                            {t('logs.analysis.reasonCode.topReasons')}
                          </p>
                          <div className="overflow-x-auto">
                            <table className="w-full min-w-[420px] text-sm">
                              <thead>
                                <tr className="border-b border-border/50 text-xs text-muted-foreground">
                                  <th className="px-2 py-2 text-left">
                                    {t('logs.analysis.reasonCode.reason')}
                                  </th>
                                  <th className="px-2 py-2 text-left">
                                    {t('logs.analysis.reasonCode.category')}
                                  </th>
                                  <th className="px-2 py-2 text-right">
                                    {t('logs.analysis.reasonCode.count')}
                                  </th>
                                  <th className="px-2 py-2 text-right">
                                    {t('logs.analysis.reasonCode.ratio')}
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {reasonCodeSummary.topReasonCodes.slice(0, 10).map((item) => (
                                  <tr
                                    key={item.reasonCode}
                                    className="border-b border-border/30 text-xs last:border-b-0"
                                  >
                                    <td className="px-2 py-2">
                                      <Link
                                        href={buildLogsSearchHref({
                                          projectId,
                                          logFileId,
                                          reasonCode: item.reasonCode,
                                        })}
                                        className="font-mono text-blue-300 hover:text-blue-200 underline-offset-2 hover:underline"
                                        title={t('logs.files.bleQuality.openInLogs')}
                                      >
                                        {item.reasonCode}
                                      </Link>
                                    </td>
                                    <td className="px-2 py-2">
                                      <Badge variant="outline">
                                        {getReasonCategoryLabel(item.category, t)}
                                      </Badge>
                                    </td>
                                    <td className="px-2 py-2 text-right tabular-nums">
                                      {item.count.toLocaleString()}
                                    </td>
                                    <td className="px-2 py-2 text-right tabular-nums">
                                      {item.ratio.toFixed(2)}%
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        <div className="rounded-lg border border-border/50 bg-background/20 p-3">
                          <p className="mb-2 text-sm font-medium">
                            {t('logs.analysis.reasonCode.categories')}
                          </p>
                          <div className="space-y-2">
                            {reasonCodeSummary.byCategory.map((category) => (
                              <div
                                key={category.category}
                                className="rounded border border-border/50 bg-background/30 p-2"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <Badge variant="secondary">
                                    {getReasonCategoryLabel(category.category, t)}
                                  </Badge>
                                  <span className="text-xs tabular-nums text-muted-foreground">
                                    {category.count.toLocaleString()} ({category.ratio.toFixed(2)}%)
                                  </span>
                                </div>
                                {category.topReasonCodes[0] && (
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    {t('logs.analysis.reasonCode.topReasonHint', {
                                      reasonCode: category.topReasonCodes[0].reasonCode,
                                      count: category.topReasonCodes[0].count,
                                    })}
                                    {' · '}
                                    <Link
                                      href={buildLogsSearchHref({
                                        projectId,
                                        logFileId,
                                        reasonCode: category.topReasonCodes[0].reasonCode,
                                      })}
                                      className="text-blue-300 hover:text-blue-200 underline-offset-2 hover:underline"
                                      title={t('logs.files.bleQuality.openInLogs')}
                                    >
                                      {t('logs.files.bleQuality.openInLogs')}
                                    </Link>
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      {reasonCodeSummary.topStageOpResults.length > 0 && (
                        <div className="rounded-lg border border-border/50 bg-background/20 p-3">
                          <p className="mb-2 text-sm font-medium">
                            {t('logs.analysis.reasonCode.stageOpResult')}
                          </p>
                          <div className="space-y-2">
                            {reasonCodeSummary.topStageOpResults.map((item, idx) => (
                              <div
                                key={`${item.stage ?? 'n'}-${item.op ?? 'n'}-${item.result ?? 'n'}-${idx}`}
                                className="rounded border border-border/40 bg-background/30 p-2"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                                  <span className="font-medium">
                                    {(item.stage ?? t('logs.analysis.reasonCode.unknownValue')).toLowerCase()} /{' '}
                                    {(item.op ?? t('logs.analysis.reasonCode.unknownValue')).toLowerCase()} /{' '}
                                    {(item.result ?? t('logs.analysis.reasonCode.unknownValue')).toLowerCase()}
                                  </span>
                                  <span className="tabular-nums text-muted-foreground">
                                    {item.count.toLocaleString()} ({item.ratio.toFixed(2)}%)
                                  </span>
                                </div>
                                {item.topReasonCodes.length > 0 && (
                                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                                    {item.topReasonCodes.map((reason) => (
                                      <Link
                                        key={reason.reasonCode}
                                        href={buildLogsSearchHref({
                                          projectId,
                                          logFileId,
                                          reasonCode: reason.reasonCode,
                                          stage: item.stage,
                                          op: item.op,
                                          result: item.result,
                                        })}
                                        title={t('logs.files.bleQuality.openInLogs')}
                                        className="rounded border border-border/50 bg-background/50 px-2 py-1 font-mono"
                                      >
                                        {reason.reasonCode} ({reason.count}, {reason.ratioWithinCombination.toFixed(1)}%)
                                      </Link>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )
                ) : (
                  <div className="rounded-md border border-border/60 bg-background/20 p-4 text-sm text-muted-foreground">
                    {t('common.loading')}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Assertion Automation */}
          <motion.div
            variants={fadeIn}
            initial="initial"
            animate="animate"
            transition={{ delay: 0.25 }}
          >
            <Card className="glass border-white/[0.08]">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ListChecks size={20} />
                  {t('logs.analysis.assertions.title')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <PageHeaderActionButton
                    onClick={() => void installDefaultRules()}
                    disabled={!projectId || installingDefaults || runningAssertion}
                    className="gap-2"
                  >
                    <ShieldCheck size={16} />
                    {installingDefaults
                      ? t('logs.analysis.assertions.actions.installing')
                      : t('logs.analysis.assertions.actions.installDefaults')}
                  </PageHeaderActionButton>
                  <Button
                    size="sm"
                    onClick={() => void runAssertionValidation()}
                    disabled={!projectId || runningAssertion || installingDefaults}
                    className="gap-2"
                  >
                    <PlayCircle size={16} />
                    {runningAssertion
                      ? t('logs.analysis.assertions.actions.running')
                      : t('logs.analysis.assertions.actions.runNow')}
                  </Button>
                  <PageHeaderActionButton
                    onClick={() => void refreshAutomationData()}
                    disabled={!projectId || assertionLoading || regressionLoading || reasonCodeLoading}
                    className="gap-2"
                  >
                    <RefreshCw
                      size={15}
                      className={
                        assertionLoading || regressionLoading || reasonCodeLoading
                          ? 'animate-spin'
                          : ''
                      }
                    />
                    {t('logs.analysis.actions.refreshAutomation')}
                  </PageHeaderActionButton>
                </div>

                {!projectId && (
                  <div className="text-sm text-amber-400">
                    {t('logs.analysis.projectContextLoading')}
                  </div>
                )}

                {assertionSummary && (
                  <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">
                    {assertionSummary}
                  </div>
                )}

                {assertionError && (
                  <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
                    {assertionError}
                  </div>
                )}

                {assertionLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                ) : assertionRuns.length === 0 ? (
                  <div className="rounded-md border border-border/60 bg-background/20 p-4 text-sm text-muted-foreground">
                    {t('logs.analysis.assertions.empty')}
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-border/50">
                    <table className="w-full min-w-[760px]">
                      <thead>
                        <tr className="border-b border-border/50 text-xs text-muted-foreground">
                          <th className="px-3 py-2 text-left">{t('table.time')}</th>
                          <th className="px-3 py-2 text-left">{t('table.status')}</th>
                          <th className="px-3 py-2 text-left">
                            {t('logs.analysis.assertions.table.triggeredBy')}
                          </th>
                          <th className="px-3 py-2 text-right">
                            {t('logs.analysis.assertions.table.passRate')}
                          </th>
                          <th className="px-3 py-2 text-right">
                            {t('logs.analysis.assertions.table.passed')}
                          </th>
                          <th className="px-3 py-2 text-right">
                            {t('logs.analysis.assertions.table.failed')}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {assertionRuns.map((run) => (
                          <tr key={run.id} className="border-b border-border/30 text-sm last:border-b-0">
                            <td className="px-3 py-2">
                              {new Date(run.createdAt).toLocaleString(localeTag)}
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-2">
                                {getRunStatusBadge(run.status, t)}
                                {run.status === 'completed' && run.failedRules === 0 && (
                                  <Badge variant="outline" className="border-emerald-500/40 text-emerald-400">
                                    {t('logs.analysis.assertions.pass')}
                                  </Badge>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">
                              {getTriggerModeLabel(run.triggeredBy, t)}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {run.passRate === null ? '-' : `${run.passRate.toFixed(2)}%`}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-emerald-400">
                              {run.passedRules ?? '-'}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-red-400">
                              {run.failedRules ?? '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Regression Trend */}
          <motion.div
            variants={fadeIn}
            initial="initial"
            animate="animate"
            transition={{ delay: 0.28 }}
          >
            <Card className="glass border-white/[0.08]">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <LineChart size={20} />
                  {t('logs.analysis.regression.title')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {regressionError && (
                  <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
                    {regressionError}
                  </div>
                )}

                {baselineHint && !regressionLoading && (
                  <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-300">
                    {baselineHint}
                  </div>
                )}

                {regressionLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                ) : (
                  regressionTrend && (
                    <>
                      <div className="rounded-md border border-border/60 bg-background/20 p-3 text-sm">
                        <p className="font-medium">
                          {t('logs.analysis.regression.baselineLabel', {
                            baseline: regressionTrend.baseline.name,
                          })}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t('logs.analysis.regression.thresholdHint', {
                            qualityDrop: regressionTrend.thresholds.qualityScoreDropMax,
                            errorRateIncrease: regressionTrend.thresholds.errorRateIncreaseMax,
                          })}
                        </p>
                      </div>
                      <div className="space-y-2">
                        {regressionTrend.items.map((item) => (
                          <div
                            key={item.logFileId}
                            className="rounded-md border border-border/50 bg-background/20 p-3"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">{item.fileName}</span>
                                <Badge
                                  variant={item.pass ? 'outline' : 'destructive'}
                                  className={item.pass ? 'border-emerald-500/40 text-emerald-400' : ''}
                                >
                                  {item.pass
                                    ? t('logs.analysis.regression.pass')
                                    : t('logs.analysis.regression.failWithCount', {
                                        count: item.violationCount,
                                      })}
                                </Badge>
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {new Date(item.analysisCreatedAt).toLocaleString(localeTag)}
                              </span>
                            </div>
                            <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground md:grid-cols-4">
                              <span>
                                {t('logs.analysis.regression.deltaQuality')}
                                <span
                                  className={`ml-1 tabular-nums ${
                                    item.diff.qualityScore >= 0 ? 'text-emerald-400' : 'text-red-400'
                                  }`}
                                >
                                  {formatSigned(item.diff.qualityScore)}
                                </span>
                              </span>
                              <span>
                                {t('logs.analysis.regression.deltaErrorRate')}
                                <span
                                  className={`ml-1 tabular-nums ${
                                    item.diff.errorRate <= 0 ? 'text-emerald-400' : 'text-red-400'
                                  }`}
                                >
                                  {formatSigned(item.diff.errorRate)}
                                </span>
                              </span>
                              <span>
                                {t('logs.analysis.regression.deltaErrors')}
                                <span className="ml-1 tabular-nums">
                                  {formatSigned(item.diff.errorEvents, 0)}
                                </span>
                              </span>
                              <span>
                                {t('logs.analysis.regression.deltaWarnings')}
                                <span className="ml-1 tabular-nums">
                                  {formatSigned(item.diff.warningEvents, 0)}
                                </span>
                              </span>
                            </div>
                            {!item.pass && item.topViolations.length > 0 && (
                              <div className="mt-2 text-xs text-red-300">
                                {t('logs.analysis.regression.topViolation', {
                                  message: item.topViolations[0].message,
                                })}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </>
                  )
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* BLE Quality */}
          {analysis.bleQuality && (
            <motion.div
              variants={fadeIn}
              initial="initial"
              animate="animate"
              transition={{ delay: 0.3 }}
            >
              <Card className="glass border-white/[0.08]">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 size={20} />
                    {t('logs.analysis.ble.title')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">
                        {t('logs.analysis.ble.coverage')}
                      </p>
                      <p className="text-2xl font-bold text-emerald-400">
                        {Math.round(analysis.bleQuality.summary.coverageRatio * 100)}%
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">
                        {t('logs.analysis.ble.requiredEvents')}
                      </p>
                      <p className="text-xl font-semibold">{analysis.bleQuality.summary.requiredTotal}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">
                        {t('logs.analysis.ble.ok')}
                      </p>
                      <p className="text-xl font-semibold text-emerald-400">
                        {analysis.bleQuality.summary.okTotal}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">
                        {t('logs.analysis.ble.missing')}
                      </p>
                      <p className="text-xl font-semibold text-red-400">
                        {analysis.bleQuality.summary.missingTotal}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">
                        {t('logs.analysis.ble.parserErrors')}
                      </p>
                      <p className="text-xl font-semibold text-amber-400">
                        {analysis.bleQuality.parser.parserErrorCount}
                      </p>
                    </div>
                  </div>

                  {analysis.bleQuality.parser.logan && (
                    <div className="p-3 rounded-lg bg-background/50 border border-border/50">
                      <p className="text-sm font-medium mb-2">{t('logs.analysis.ble.loganDecryption')}</p>
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground">
                            {t('logs.analysis.backend.total')}:{' '}
                          </span>
                          <span className="font-medium">
                            {analysis.bleQuality.parser.logan.blocksTotal}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">
                            {t('logs.analysis.ble.succeeded')}:{' '}
                          </span>
                          <span className="font-medium text-emerald-400">
                            {analysis.bleQuality.parser.logan.blocksSucceeded}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">
                            {t('logs.analysis.backend.failed')}:{' '}
                          </span>
                          <span className="font-medium text-red-400">
                            {analysis.bleQuality.parser.logan.blocksFailed}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Backend Quality */}
          {analysis.backendQuality && (
            <motion.div
              variants={fadeIn}
              initial="initial"
              animate="animate"
              transition={{ delay: 0.4 }}
            >
              <Card className="glass border-white/[0.08]">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp size={20} />
                    {t('logs.analysis.backend.title')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-sm font-medium mb-3">{t('logs.analysis.backend.httpRequests')}</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">
                          {t('logs.analysis.backend.total')}
                        </p>
                        <p className="text-xl font-semibold">{analysis.backendQuality.http.total}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">
                          {t('logs.analysis.backend.success')}
                        </p>
                        <p className="text-xl font-semibold text-emerald-400">
                          {analysis.backendQuality.http.success}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">
                          {t('logs.analysis.backend.failed')}
                        </p>
                        <p className="text-xl font-semibold text-red-400">
                          {analysis.backendQuality.http.failed}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">
                          {t('logs.analysis.backend.successRate')}
                        </p>
                        <p className="text-xl font-semibold text-emerald-400">
                          {Math.round(analysis.backendQuality.http.successRate)}%
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-border/50 pt-4">
                    <p className="text-sm font-medium mb-3">{t('logs.analysis.backend.mqtt')}</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">
                          {t('logs.analysis.backend.connected')}
                        </p>
                        <p className="text-xl font-semibold">{analysis.backendQuality.mqtt.connected}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">
                          {t('logs.analysis.backend.publishSuccess')}
                        </p>
                        <p className="text-xl font-semibold text-emerald-400">
                          {analysis.backendQuality.mqtt.publishSuccess}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">
                          {t('logs.analysis.backend.publishFailed')}
                        </p>
                        <p className="text-xl font-semibold text-red-400">
                          {analysis.backendQuality.mqtt.publishFailed}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">
                          {t('logs.analysis.backend.ackTimeout')}
                        </p>
                        <p className="text-xl font-semibold text-amber-400">
                          {analysis.backendQuality.mqtt.ackTimeout}
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Anomalies */}
          {analysis.anomalies.length > 0 && (
            <motion.div
              variants={fadeIn}
              initial="initial"
              animate="animate"
              transition={{ delay: 0.5 }}
            >
              <Card className="glass border-white/[0.08]">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Bug size={20} />
                    {t('logs.analysis.anomalies.title', { count: analysis.anomalies.length })}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {analysis.anomalies.map((anomaly, idx) => (
                      <div
                        key={idx}
                        className="p-4 rounded-lg border border-border/50 bg-background/30"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            {getSeverityBadge(anomaly.severity, t)}
                            <Badge variant="outline">{anomaly.type}</Badge>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {t('logs.analysis.anomalies.occurrences', {
                              count: anomaly.occurrences,
                            })}
                          </span>
                        </div>
                        <p className="text-sm font-medium mb-1">{anomaly.description}</p>
                        <p className="text-xs text-muted-foreground mb-2">{anomaly.suggestion}</p>
                        <div className="text-xs text-muted-foreground">
                          {t('logs.analysis.anomalies.affectedSessions', {
                            count: anomaly.affectedSessions.length,
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Known Issue Matches */}
          {analysis.knownIssueMatches.length > 0 && (
            <motion.div
              variants={fadeIn}
              initial="initial"
              animate="animate"
              transition={{ delay: 0.6 }}
            >
              <Card className="glass border-white/[0.08]">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle2 size={20} />
                    {t('logs.analysis.knownIssues.title', {
                      count: analysis.knownIssueMatches.length,
                    })}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {analysis.knownIssueMatches.map((issue) => (
                      <div
                        key={issue.issueId}
                        className="p-4 rounded-lg border border-border/50 bg-background/30"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            {getSeverityBadge(issue.severity, t)}
                            <Badge variant="outline">{issue.category}</Badge>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {t('logs.analysis.knownIssues.confidence', {
                              percent: Math.round(issue.confidence * 100),
                            })}
                          </span>
                        </div>
                        <h4 className="font-semibold mb-1">{issue.title}</h4>
                        <p className="text-sm text-muted-foreground mb-2">{issue.description}</p>
                        <div className="p-3 rounded bg-emerald-500/10 border border-emerald-500/20">
                          <p className="text-xs font-medium text-emerald-400 mb-1">
                            {t('logs.analysis.knownIssues.solution')}
                          </p>
                          <p className="text-sm">{issue.solution}</p>
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground">
                          {t('logs.analysis.knownIssues.matchedEvents', {
                            count: issue.eventIds.length,
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </>
      )}
    </div>
  );
}
