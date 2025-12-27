'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
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
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiClientError, apiFetch } from '@/lib/api';
import { getProjectId } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { fadeIn } from '@/lib/animations';

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

function getSeverityBadge(severity: number) {
  if (severity >= 4) return <Badge variant="destructive">Critical</Badge>;
  if (severity >= 3) return <Badge variant="warning">High</Badge>;
  if (severity >= 2) return <Badge variant="info">Medium</Badge>;
  return <Badge variant="secondary">Low</Badge>;
}

export default function AnalysisPage() {
  const { t, localeTag } = useI18n();
  const params = useParams();
  const router = useRouter();
  const logFileId = params?.id as string | undefined;

  const [analysis, setAnalysis] = useState<LogFileAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retrying, setRetrying] = useState(false);

  const projectId = getProjectId() ?? '';

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
        const msg =
          e instanceof ApiClientError
            ? `${e.code}: ${e.message}`
            : String(e);
        setError(msg);
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
      setError('');
    } catch (e: unknown) {
      const msg =
        e instanceof ApiClientError ? `${e.code}: ${e.message}` : String(e);
      setError(msg);
    } finally {
      setRetrying(false);
    }
  }

  if (!logFileId) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Invalid log file ID
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        variants={fadeIn}
        initial="initial"
        animate="animate"
        className="flex items-center justify-between"
      >
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push('/logs/files')}
          >
            <ArrowLeft size={20} />
          </Button>
          <div>
            <h1 className="text-2xl font-bold gradient-text">Log Analysis Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Automated quality analysis and diagnostics
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void triggerAnalysis()}
            disabled={retrying || loading}
            className="gap-2"
          >
            <RefreshCw size={16} className={retrying ? 'animate-spin' : ''} />
            Re-analyze
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/logs/files/${logFileId}`}>
              <FileText size={16} className="mr-2" />
              View File
            </Link>
          </Button>
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
                <h3 className="font-semibold text-destructive mb-2">Analysis Error</h3>
                <p className="text-sm text-muted-foreground">{error}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void triggerAnalysis()}
                  disabled={retrying}
                  className="mt-4"
                >
                  Retry Analysis
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
                    <p className="font-medium text-amber-400">Analysis in Progress</p>
                    <p className="text-sm text-muted-foreground">
                      The analysis is currently running. Results will update automatically.
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
                    <p className="font-medium text-destructive">Analysis Failed</p>
                    <p className="text-sm text-muted-foreground">
                      {analysis.errorMessage || 'Unknown error occurred'}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void triggerAnalysis()}
                    disabled={retrying}
                  >
                    Retry
                  </Button>
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
                        Overall Quality Score
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
            <Card className="glass">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <FileText size={20} className="text-blue-400" />
                  <div>
                    <p className="text-xs text-muted-foreground">Total Events</p>
                    <p className="text-2xl font-bold">{analysis.totalEvents.toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="glass">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <AlertCircle size={20} className="text-red-400" />
                  <div>
                    <p className="text-xs text-muted-foreground">Errors</p>
                    <p className="text-2xl font-bold">{analysis.errorEvents.toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="glass">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <AlertTriangle size={20} className="text-amber-400" />
                  <div>
                    <p className="text-xs text-muted-foreground">Warnings</p>
                    <p className="text-2xl font-bold">{analysis.warningEvents.toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="glass">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <Activity size={20} className="text-emerald-400" />
                  <div>
                    <p className="text-xs text-muted-foreground">Sessions</p>
                    <p className="text-2xl font-bold">{analysis.sessionCount.toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="glass">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <Zap size={20} className="text-purple-400" />
                  <div>
                    <p className="text-xs text-muted-foreground">Devices</p>
                    <p className="text-2xl font-bold">{analysis.deviceCount.toLocaleString()}</p>
                  </div>
                </div>
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
              <Card className="glass">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 size={20} />
                    BLE Quality Report
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Coverage</p>
                      <p className="text-2xl font-bold text-emerald-400">
                        {Math.round(analysis.bleQuality.summary.coverageRatio * 100)}%
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Required Events</p>
                      <p className="text-xl font-semibold">{analysis.bleQuality.summary.requiredTotal}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">OK</p>
                      <p className="text-xl font-semibold text-emerald-400">
                        {analysis.bleQuality.summary.okTotal}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Missing</p>
                      <p className="text-xl font-semibold text-red-400">
                        {analysis.bleQuality.summary.missingTotal}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Parser Errors</p>
                      <p className="text-xl font-semibold text-amber-400">
                        {analysis.bleQuality.parser.parserErrorCount}
                      </p>
                    </div>
                  </div>

                  {analysis.bleQuality.parser.logan && (
                    <div className="p-3 rounded-lg bg-background/50 border border-border/50">
                      <p className="text-sm font-medium mb-2">Logan Decryption</p>
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground">Total: </span>
                          <span className="font-medium">
                            {analysis.bleQuality.parser.logan.blocksTotal}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Succeeded: </span>
                          <span className="font-medium text-emerald-400">
                            {analysis.bleQuality.parser.logan.blocksSucceeded}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Failed: </span>
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
              <Card className="glass">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp size={20} />
                    Backend Quality Report
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-sm font-medium mb-3">HTTP Requests</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Total</p>
                        <p className="text-xl font-semibold">{analysis.backendQuality.http.total}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Success</p>
                        <p className="text-xl font-semibold text-emerald-400">
                          {analysis.backendQuality.http.success}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Failed</p>
                        <p className="text-xl font-semibold text-red-400">
                          {analysis.backendQuality.http.failed}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Success Rate</p>
                        <p className="text-xl font-semibold text-emerald-400">
                          {Math.round(analysis.backendQuality.http.successRate)}%
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-border/50 pt-4">
                    <p className="text-sm font-medium mb-3">MQTT</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Connected</p>
                        <p className="text-xl font-semibold">{analysis.backendQuality.mqtt.connected}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Publish Success</p>
                        <p className="text-xl font-semibold text-emerald-400">
                          {analysis.backendQuality.mqtt.publishSuccess}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Publish Failed</p>
                        <p className="text-xl font-semibold text-red-400">
                          {analysis.backendQuality.mqtt.publishFailed}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">ACK Timeout</p>
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
              <Card className="glass">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Bug size={20} />
                    Detected Anomalies ({analysis.anomalies.length})
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
                            {getSeverityBadge(anomaly.severity)}
                            <Badge variant="outline">{anomaly.type}</Badge>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {anomaly.occurrences} occurrence{anomaly.occurrences !== 1 ? 's' : ''}
                          </span>
                        </div>
                        <p className="text-sm font-medium mb-1">{anomaly.description}</p>
                        <p className="text-xs text-muted-foreground mb-2">{anomaly.suggestion}</p>
                        <div className="text-xs text-muted-foreground">
                          Affected sessions: {anomaly.affectedSessions.length}
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
              <Card className="glass">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle2 size={20} />
                    Known Issues Matched ({analysis.knownIssueMatches.length})
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
                            {getSeverityBadge(issue.severity)}
                            <Badge variant="outline">{issue.category}</Badge>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {Math.round(issue.confidence * 100)}% confidence
                          </span>
                        </div>
                        <h4 className="font-semibold mb-1">{issue.title}</h4>
                        <p className="text-sm text-muted-foreground mb-2">{issue.description}</p>
                        <div className="p-3 rounded bg-emerald-500/10 border border-emerald-500/20">
                          <p className="text-xs font-medium text-emerald-400 mb-1">Solution</p>
                          <p className="text-sm">{issue.solution}</p>
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground">
                          Matched {issue.eventIds.length} event{issue.eventIds.length !== 1 ? 's' : ''}
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
