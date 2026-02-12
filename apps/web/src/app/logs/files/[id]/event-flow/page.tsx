'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { PageHeader, PageHeaderActionButton } from '@/components/ui/page-header';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  TrendingUp,
  BarChart3,
  Activity,
} from 'lucide-react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

// Type definitions matching backend
type MainFlowAnalysisResult = {
  templateId: string;
  templateName: string;
  totalSessions: number;
  completedSessions: number;
  completionRate: number;
  avgTotalDurationMs: number | null;
  stages: StageAnalysisResult[];
  sampleSessions: SessionAnalysis[];
};

type StageAnalysisResult = {
  stageId: string;
  stageName: string;
  required: boolean;
  maxDurationMs: number | null;
  sessionsCovered: number;
  coverageRate: number;
  avgDurationMs: number | null;
  maxObservedDurationMs: number | null;
  minDurationMs: number | null;
  events: EventAnalysisResult[];
  issues: StageIssue[];
};

type EventAnalysisResult = {
  eventName: string;
  required: boolean;
  occurrenceCount: number;
  sessionHitCount: number;
  missedCount: number;
  hitRate: number;
};

type StageIssue = {
  type: 'timeout' | 'missing_event' | 'failure_event';
  severity: number;
  description: string;
  affectedSessions: string[];
};

type SessionAnalysis = {
  linkCode: string;
  deviceMac: string | null;
  totalDurationMs: number | null;
  completed: boolean;
  stagesCompleted: number;
  coverageRate: number;
  stageTimings: StageTiming[];
  missedEvents: string[];
};

type StageTiming = {
  stageId: string;
  stageName: string;
  startTime: number | null;
  endTime: number | null;
  durationMs: number | null;
  completed: boolean;
  events: Array<{
    eventName: string;
    timestampMs: number;
  }>;
};

type EventCoverageAnalysisResult = {
  totalEvents: number;
  knownEventsCount: number;
  summary: {
    coveredCount: number;
    missingCount: number;
    coverageRate: number;
  };
  byCategory: CategoryCoverageResult[];
  extraEvents: ExtraEventResult[];
};

type CategoryCoverageResult = {
  category: string;
  totalCount: number;
  coveredCount: number;
  missingCount: number;
  coverageRate: number;
  events: EventCoverageResult[];
};

type EventCoverageResult = {
  eventName: string;
  level: string;
  description: string;
  covered: boolean;
  occurrenceCount: number;
};

type ExtraEventResult = {
  eventName: string;
  occurrenceCount: number;
};

// Format duration in ms to readable string
function formatDuration(ms: number | null): string {
  if (ms === null || ms === undefined) return 'N/A';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}min`;
}

// Get severity badge color
function getSeverityColor(severity: number): 'destructive' | 'default' | 'secondary' {
  if (severity >= 4) return 'destructive';
  if (severity >= 3) return 'default';
  return 'secondary';
}

export default function EventFlowAnalysisPage() {
  const { t } = useI18n();
  const params = useParams();
  const fileId = params.id as string;
  const logsHref = `/logs?${new URLSearchParams({ logFileId: fileId }).toString()}`;

  const [loading, setLoading] = useState(true);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mainFlow, setMainFlow] = useState<MainFlowAnalysisResult | null>(null);
  const [coverage, setCoverage] = useState<EventCoverageAnalysisResult | null>(null);

  async function triggerAnalyze() {
    try {
      setReanalyzing(true);
      setError(null);
      await apiFetch(`/api/logs/files/${fileId}/analyze`, {
        method: 'POST',
      });
      await new Promise((resolve) => setTimeout(resolve, 3000));
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('logs.eventFlow.triggerFailed'));
      setLoading(false);
    } finally {
      setReanalyzing(false);
    }
  }

  useEffect(() => {
    async function fetchData() {
      try {
        const data = await apiFetch<{
          mainFlowAnalysis: MainFlowAnalysisResult;
          eventCoverageAnalysis: EventCoverageAnalysisResult;
        }>(`/api/logs/files/${fileId}/event-flow-analysis`);

        setMainFlow(data.mainFlowAnalysis);
        setCoverage(data.eventCoverageAnalysis);
      } catch (err: unknown) {
        const status =
          typeof err === 'object' && err !== null && 'status' in err && typeof (err as { status?: unknown }).status === 'number'
            ? (err as { status: number }).status
            : undefined;
        const message = err instanceof Error ? err.message : String(err);
        // If analysis not found (404), don't set error - show "no data" UI instead
        if (status === 404 || message.includes('not found')) {
          // Leave mainFlow and coverage as null to trigger "no data" UI
        } else {
          setError(message || t('logs.eventFlow.unknownError'));
        }
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [fileId, t]);

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-[1560px] p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <Activity className="w-8 h-8 animate-spin mx-auto mb-2" />
            <p className="text-muted-foreground">{t('logs.eventFlow.loading')}</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto w-full max-w-[1560px] p-6">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{t('logs.eventFlow.loadFailed')}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!mainFlow || !coverage) {
    return (
      <div className="mx-auto w-full max-w-[1560px] p-6">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{t('logs.eventFlow.emptyTitle')}</AlertTitle>
          <AlertDescription>
            {t('logs.eventFlow.emptyDescription')}
            <div className="mt-4">
              <Button onClick={triggerAnalyze} disabled={reanalyzing}>
                {t('logs.eventFlow.analyzeNow')}
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1560px] space-y-6 p-6">
      {/* Header */}
      <PageHeader
        title={t('logs.eventFlow.title')}
        subtitle={t('logs.eventFlow.subtitle')}
        actions={(
          <div className="flex items-center gap-2">
            <PageHeaderActionButton onClick={triggerAnalyze} disabled={reanalyzing}>
              {t('logs.analysis.actions.reanalyze')}
            </PageHeaderActionButton>
            <PageHeaderActionButton asChild>
              <Link href={`/logs/files/${fileId}`}>{t('logs.files.backToDetail')}</Link>
            </PageHeaderActionButton>
          </div>
        )}
      />
      <div className="flex flex-wrap items-center gap-2 px-1">
        <span className="text-xs text-muted-foreground">{t('logs.files.quickLinks')}</span>
        <PageHeaderActionButton asChild className="h-7 rounded-full px-3 text-xs">
          <Link href={`/logs/files/${fileId}/viewer`}>{t('logs.files.viewContent')}</Link>
        </PageHeaderActionButton>
        <PageHeaderActionButton asChild className="h-7 rounded-full px-3 text-xs">
          <Link href={logsHref}>{t('logs.files.openInLogs')}</Link>
        </PageHeaderActionButton>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="main-flow" className="space-y-6">
        <TabsList className="h-auto border border-white/[0.08] bg-background/30 p-1">
          <TabsTrigger value="main-flow" className="gap-2">
            <Activity className="w-4 h-4" />
            {t('logs.eventFlow.tab.mainFlow')}
          </TabsTrigger>
          <TabsTrigger value="coverage" className="gap-2">
            <BarChart3 className="w-4 h-4" />
            {t('logs.eventFlow.tab.coverage')}
          </TabsTrigger>
        </TabsList>

        {/* Main Flow Tab */}
        <TabsContent value="main-flow" className="space-y-6">
          <MainFlowAnalysis mainFlow={mainFlow} />
        </TabsContent>

        {/* Coverage Tab */}
        <TabsContent value="coverage" className="space-y-6">
          <EventCoverageAnalysis coverage={coverage} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Main Flow Analysis Component
function MainFlowAnalysis({ mainFlow }: { mainFlow: MainFlowAnalysisResult }) {
  const { t } = useI18n();

  return (
    <>
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="glass border-white/[0.08]">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('logs.eventFlow.mainFlow.totalSessions')}</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{mainFlow.totalSessions}</div>
          </CardContent>
        </Card>

        <Card className="glass border-white/[0.08]">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('logs.eventFlow.mainFlow.completedSessions')}</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{mainFlow.completedSessions}</div>
          </CardContent>
        </Card>

        <Card className="glass border-white/[0.08]">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('logs.eventFlow.mainFlow.completionRate')}</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{mainFlow.completionRate.toFixed(1)}%</div>
            <Progress value={mainFlow.completionRate} className="mt-2" />
          </CardContent>
        </Card>

        <Card className="glass border-white/[0.08]">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('logs.eventFlow.mainFlow.avgDuration')}</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatDuration(mainFlow.avgTotalDurationMs)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Stage Analysis */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">{t('logs.eventFlow.mainFlow.stageAnalysis')}</h2>
        {mainFlow.stages.map((stage, index) => (
          <StageCard
            key={stage.stageId}
            stage={stage}
            index={index + 1}
            totalSessions={mainFlow.totalSessions}
          />
        ))}
      </div>

      {/* Sample Sessions */}
      {mainFlow.sampleSessions.length > 0 && (
        <Card className="glass border-white/[0.08]">
          <CardHeader>
            <CardTitle>{t('logs.eventFlow.mainFlow.sampleSessions.title')}</CardTitle>
            <CardDescription>
              {t('logs.eventFlow.mainFlow.sampleSessions.description')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('logs.eventFlow.mainFlow.table.linkCode')}</TableHead>
                  <TableHead>{t('logs.eventFlow.mainFlow.table.deviceMac')}</TableHead>
                  <TableHead>{t('logs.eventFlow.mainFlow.table.totalDuration')}</TableHead>
                  <TableHead>{t('logs.eventFlow.mainFlow.table.completedStages')}</TableHead>
                  <TableHead>{t('logs.eventFlow.mainFlow.table.coverage')}</TableHead>
                  <TableHead>{t('logs.eventFlow.mainFlow.table.status')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mainFlow.sampleSessions.map((session) => (
                  <TableRow key={session.linkCode}>
                    <TableCell className="font-mono text-xs">
                      {session.linkCode}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {session.deviceMac || t('logs.eventFlow.common.na')}
                    </TableCell>
                    <TableCell>{formatDuration(session.totalDurationMs)}</TableCell>
                    <TableCell>
                      {session.stagesCompleted}/{mainFlow.stages.length}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress value={session.coverageRate} className="w-16" />
                        <span className="text-xs">{session.coverageRate.toFixed(0)}%</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {session.completed ? (
                        <Badge variant="default" className="bg-green-600">
                          {t('logs.eventFlow.mainFlow.status.completed')}
                        </Badge>
                      ) : (
                        <Badge variant="secondary">
                          {t('logs.eventFlow.mainFlow.status.incomplete')}
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </>
  );
}

// Stage Card Component
function StageCard({
  stage,
  index,
  totalSessions,
}: {
  stage: StageAnalysisResult;
  index: number;
  totalSessions: number;
}) {
  const { t } = useI18n();

  return (
    <Card className="glass border-white/[0.08]">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground font-bold">
              {index}
            </div>
            <div>
              <CardTitle className="text-lg">{stage.stageName}</CardTitle>
              <CardDescription className="flex items-center gap-2 mt-1">
                {stage.required && (
                  <Badge variant="outline" className="text-xs">
                    {t('logs.eventFlow.stage.required')}
                  </Badge>
                )}
                {stage.maxDurationMs && (
                  <span className="text-xs">
                    {t('logs.eventFlow.stage.expectedDuration')}: ≤ {formatDuration(stage.maxDurationMs)}
                  </span>
                )}
              </CardDescription>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold">{stage.coverageRate.toFixed(0)}%</div>
            <div className="text-xs text-muted-foreground">
              {t('logs.eventFlow.stage.sessions', {
                covered: stage.sessionsCovered,
                total: totalSessions,
              })}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Timing Stats */}
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-muted-foreground">{t('logs.eventFlow.stage.avgDuration')}</div>
            <div className="font-medium">{formatDuration(stage.avgDurationMs)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">{t('logs.eventFlow.stage.maxDuration')}</div>
            <div className="font-medium">
              {formatDuration(stage.maxObservedDurationMs)}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">{t('logs.eventFlow.stage.minDuration')}</div>
            <div className="font-medium">{formatDuration(stage.minDurationMs)}</div>
          </div>
        </div>

        {/* Events Table */}
        <div>
          <h4 className="font-medium mb-2">{t('logs.eventFlow.stage.eventsList')}</h4>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('logs.eventFlow.stage.table.eventName')}</TableHead>
                <TableHead>{t('logs.eventFlow.stage.table.required')}</TableHead>
                <TableHead>{t('logs.eventFlow.stage.table.occurrenceCount')}</TableHead>
                <TableHead>{t('logs.eventFlow.stage.table.hitSessions')}</TableHead>
                <TableHead>{t('logs.eventFlow.stage.table.missedSessions')}</TableHead>
                <TableHead>{t('logs.eventFlow.stage.table.hitRate')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stage.events.map((event) => (
                <TableRow key={event.eventName}>
                  <TableCell className="font-mono text-xs">{event.eventName}</TableCell>
                  <TableCell>
                    {event.required ? (
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                    ) : (
                      <span className="text-muted-foreground text-xs">
                        {t('logs.eventFlow.stage.optional')}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>{event.occurrenceCount}</TableCell>
                  <TableCell>{event.sessionHitCount}</TableCell>
                  <TableCell>
                    {event.missedCount > 0 ? (
                      <span className="text-red-600 font-medium">{event.missedCount}</span>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Progress value={event.hitRate} className="w-16" />
                      <span className="text-xs">{event.hitRate.toFixed(0)}%</span>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Issues */}
        {stage.issues.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-medium">{t('logs.eventFlow.stage.issuesTitle')}</h4>
            {stage.issues.map((issue, idx) => (
              <Alert
                key={idx}
                variant={issue.severity >= 4 ? 'destructive' : 'default'}
              >
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle className="flex items-center gap-2">
                  {issue.description}
                  <Badge variant={getSeverityColor(issue.severity)}>
                    {t('logs.eventFlow.stage.severity', { severity: issue.severity })}
                  </Badge>
                </AlertTitle>
                <AlertDescription>
                  {t('logs.eventFlow.stage.affectedSessions', {
                    count: issue.affectedSessions.length,
                  })}
                  {issue.affectedSessions.length <= 3 && (
                    <span className="ml-2 font-mono text-xs">
                      ({issue.affectedSessions.join(', ')})
                    </span>
                  )}
                </AlertDescription>
              </Alert>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Event Coverage Analysis Component
function EventCoverageAnalysis({ coverage }: { coverage: EventCoverageAnalysisResult }) {
  const { t } = useI18n();

  return (
    <>
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="glass border-white/[0.08]">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('logs.eventFlow.coverage.totalEvents')}</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{coverage.totalEvents}</div>
          </CardContent>
        </Card>

        <Card className="glass border-white/[0.08]">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('logs.eventFlow.coverage.knownEvents')}</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{coverage.knownEventsCount}</div>
          </CardContent>
        </Card>

        <Card className="glass border-white/[0.08]">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('logs.eventFlow.coverage.coveredEvents')}</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{coverage.summary.coveredCount}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {t('logs.eventFlow.coverage.missingCount', { count: coverage.summary.missingCount })}
            </p>
          </CardContent>
        </Card>

        <Card className="glass border-white/[0.08]">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('logs.eventFlow.coverage.coverageRate')}</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {coverage.summary.coverageRate.toFixed(1)}%
            </div>
            <Progress value={coverage.summary.coverageRate} className="mt-2" />
          </CardContent>
        </Card>
      </div>

      {/* Category Coverage */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">{t('logs.eventFlow.coverage.categoryCoverage')}</h2>
        {coverage.byCategory.map((category) => (
          <CategoryCard key={category.category} category={category} />
        ))}
      </div>

      {/* Extra Events */}
      {coverage.extraEvents.length > 0 && (
        <Card className="glass border-white/[0.08]">
          <CardHeader>
            <CardTitle>{t('logs.eventFlow.coverage.extraEvents.title')}</CardTitle>
            <CardDescription>
              {t('logs.eventFlow.coverage.extraEvents.description', {
                count: coverage.extraEvents.length,
              })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('logs.eventFlow.coverage.extraEvents.table.eventName')}</TableHead>
                  <TableHead>{t('logs.eventFlow.coverage.extraEvents.table.occurrenceCount')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {coverage.extraEvents.slice(0, 20).map((event) => (
                  <TableRow key={event.eventName}>
                    <TableCell className="font-mono text-xs">{event.eventName}</TableCell>
                    <TableCell>{event.occurrenceCount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {coverage.extraEvents.length > 20 && (
              <p className="text-sm text-muted-foreground mt-2">
                {t('logs.eventFlow.coverage.extraEvents.showingLimit', {
                  count: coverage.extraEvents.length,
                })}
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </>
  );
}

// Category Card Component
function CategoryCard({ category }: { category: CategoryCoverageResult }) {
  const { t } = useI18n();

  return (
    <Card className="glass border-white/[0.08]">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{category.category}</CardTitle>
          <div className="text-right">
            <div className="text-2xl font-bold">{category.coverageRate.toFixed(0)}%</div>
            <div className="text-xs text-muted-foreground">
              {t('logs.eventFlow.coverage.categoryEvents', {
                covered: category.coveredCount,
                total: category.totalCount,
              })}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('logs.eventFlow.coverage.categoryTable.eventName')}</TableHead>
              <TableHead>{t('logs.eventFlow.coverage.categoryTable.level')}</TableHead>
              <TableHead>{t('logs.eventFlow.coverage.categoryTable.description')}</TableHead>
              <TableHead>{t('logs.eventFlow.coverage.categoryTable.occurrenceCount')}</TableHead>
              <TableHead>{t('logs.eventFlow.coverage.categoryTable.status')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {category.events.map((event) => (
              <TableRow key={event.eventName}>
                <TableCell className="font-mono text-xs">{event.eventName}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-xs">
                    {event.level}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm">{event.description}</TableCell>
                <TableCell>
                  {event.covered ? (
                    <span className="font-medium">{event.occurrenceCount}</span>
                  ) : (
                    <span className="text-muted-foreground">0</span>
                  )}
                </TableCell>
                <TableCell>
                  {event.covered ? (
                    <Badge variant="default" className="bg-green-600">
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      {t('logs.eventFlow.coverage.status.covered')}
                    </Badge>
                  ) : (
                    <Badge variant="secondary">
                      <XCircle className="w-3 h-3 mr-1" />
                      {t('logs.eventFlow.coverage.status.missing')}
                    </Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
