'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
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
  ArrowLeft,
} from 'lucide-react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';

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
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}min`;
}

// Get severity badge color
function getSeverityColor(severity: number): string {
  if (severity >= 4) return 'destructive';
  if (severity >= 3) return 'default';
  return 'secondary';
}

export default function EventFlowAnalysisPage() {
  const params = useParams();
  const fileId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mainFlow, setMainFlow] = useState<MainFlowAnalysisResult | null>(null);
  const [coverage, setCoverage] = useState<EventCoverageAnalysisResult | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const data = await apiFetch<{
          mainFlowAnalysis: MainFlowAnalysisResult;
          eventCoverageAnalysis: EventCoverageAnalysisResult;
        }>(`/api/logs/files/${fileId}/event-flow-analysis`);

        console.log('=== Event Flow Analysis Response ===');
        console.log('mainFlowAnalysis:', data.mainFlowAnalysis);
        console.log('eventCoverageAnalysis:', data.eventCoverageAnalysis);

        setMainFlow(data.mainFlowAnalysis);
        setCoverage(data.eventCoverageAnalysis);
      } catch (err: any) {
        console.error('=== Fetch Error ===', err);
        // If analysis not found (404), don't set error - show "no data" UI instead
        if (err?.status === 404 || err?.message?.includes('not found')) {
          // Leave mainFlow and coverage as null to trigger "no data" UI
          console.log('Analysis not found - showing trigger button');
        } else {
          setError(err instanceof Error ? err.message : 'Unknown error');
        }
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [fileId]);

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <Activity className="w-8 h-8 animate-spin mx-auto mb-2" />
            <p className="text-muted-foreground">正在加载事件流分析...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>加载失败</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!mainFlow || !coverage) {
    return (
      <div className="container mx-auto p-6">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>暂无数据</AlertTitle>
          <AlertDescription>
            该日志文件尚未进行事件流分析
            <div className="mt-4">
              <Button
                onClick={async () => {
                  try {
                    setLoading(true);
                    await apiFetch(`/api/logs/files/${fileId}/analyze`, {
                      method: 'POST',
                    });
                    // Wait a bit for analysis to complete
                    await new Promise((resolve) => setTimeout(resolve, 3000));
                    // Reload the page
                    window.location.reload();
                  } catch (err) {
                    setError(err instanceof Error ? err.message : '触发分析失败');
                    setLoading(false);
                  }
                }}
              >
                立即分析
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Link href={`/logs/files/${fileId}`}>
              <Button variant="ghost" size="sm">
                <ArrowLeft className="w-4 h-4 mr-1" />
                返回
              </Button>
            </Link>
            <h1 className="text-3xl font-bold">事件流分析</h1>
          </div>
          <p className="text-muted-foreground">分析日志文件中的事件链路和覆盖情况</p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="main-flow" className="space-y-6">
        <TabsList>
          <TabsTrigger value="main-flow" className="gap-2">
            <Activity className="w-4 h-4" />
            主链路分析
          </TabsTrigger>
          <TabsTrigger value="coverage" className="gap-2">
            <BarChart3 className="w-4 h-4" />
            事件覆盖检查
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
  return (
    <>
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">总会话数</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{mainFlow.totalSessions}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">完成会话</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{mainFlow.completedSessions}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">完成率</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{mainFlow.completionRate.toFixed(1)}%</div>
            <Progress value={mainFlow.completionRate} className="mt-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">平均耗时</CardTitle>
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
        <h2 className="text-xl font-semibold">阶段分析</h2>
        {mainFlow.stages.map((stage, index) => (
          <StageCard key={stage.stageId} stage={stage} index={index + 1} />
        ))}
      </div>

      {/* Sample Sessions */}
      {mainFlow.sampleSessions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>示例会话</CardTitle>
            <CardDescription>显示部分会话的详细分析结果</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>LinkCode</TableHead>
                  <TableHead>设备 MAC</TableHead>
                  <TableHead>总耗时</TableHead>
                  <TableHead>完成阶段</TableHead>
                  <TableHead>覆盖率</TableHead>
                  <TableHead>状态</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mainFlow.sampleSessions.map((session) => (
                  <TableRow key={session.linkCode}>
                    <TableCell className="font-mono text-xs">
                      {session.linkCode}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {session.deviceMac || 'N/A'}
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
                          完成
                        </Badge>
                      ) : (
                        <Badge variant="secondary">未完成</Badge>
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
function StageCard({ stage, index }: { stage: StageAnalysisResult; index: number }) {
  return (
    <Card>
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
                    必需
                  </Badge>
                )}
                {stage.maxDurationMs && (
                  <span className="text-xs">
                    预期耗时: ≤ {formatDuration(stage.maxDurationMs)}
                  </span>
                )}
              </CardDescription>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold">{stage.coverageRate.toFixed(0)}%</div>
            <div className="text-xs text-muted-foreground">
              {stage.sessionsCovered} / {stage.sessionsCovered} 会话
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Timing Stats */}
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-muted-foreground">平均耗时</div>
            <div className="font-medium">{formatDuration(stage.avgDurationMs)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">最大耗时</div>
            <div className="font-medium">
              {formatDuration(stage.maxObservedDurationMs)}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">最小耗时</div>
            <div className="font-medium">{formatDuration(stage.minDurationMs)}</div>
          </div>
        </div>

        {/* Events Table */}
        <div>
          <h4 className="font-medium mb-2">事件列表</h4>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>事件名称</TableHead>
                <TableHead>必需</TableHead>
                <TableHead>出现次数</TableHead>
                <TableHead>命中会话</TableHead>
                <TableHead>缺失会话</TableHead>
                <TableHead>命中率</TableHead>
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
                      <span className="text-muted-foreground text-xs">可选</span>
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
            <h4 className="font-medium">发现的问题</h4>
            {stage.issues.map((issue, idx) => (
              <Alert
                key={idx}
                variant={issue.severity >= 4 ? 'destructive' : 'default'}
              >
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle className="flex items-center gap-2">
                  {issue.description}
                  <Badge variant={getSeverityColor(issue.severity) as any}>
                    严重度: {issue.severity}
                  </Badge>
                </AlertTitle>
                <AlertDescription>
                  影响会话: {issue.affectedSessions.length} 个
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
  return (
    <>
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">总事件数</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{coverage.totalEvents}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">已知事件</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{coverage.knownEventsCount}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">覆盖事件</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{coverage.summary.coveredCount}</div>
            <p className="text-xs text-muted-foreground mt-1">
              缺失 {coverage.summary.missingCount} 个
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">覆盖率</CardTitle>
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
        <h2 className="text-xl font-semibold">分类覆盖统计</h2>
        {coverage.byCategory.map((category) => (
          <CategoryCard key={category.category} category={category} />
        ))}
      </div>

      {/* Extra Events */}
      {coverage.extraEvents.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>额外事件</CardTitle>
            <CardDescription>
              日志中出现但不在已知事件列表中的事件 (共 {coverage.extraEvents.length} 个)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>事件名称</TableHead>
                  <TableHead>出现次数</TableHead>
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
                仅显示前 20 个,共 {coverage.extraEvents.length} 个额外事件
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
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{category.category}</CardTitle>
          <div className="text-right">
            <div className="text-2xl font-bold">{category.coverageRate.toFixed(0)}%</div>
            <div className="text-xs text-muted-foreground">
              {category.coveredCount} / {category.totalCount} 事件
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>事件名称</TableHead>
              <TableHead>级别</TableHead>
              <TableHead>说明</TableHead>
              <TableHead>出现次数</TableHead>
              <TableHead>状态</TableHead>
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
                      已覆盖
                    </Badge>
                  ) : (
                    <Badge variant="secondary">
                      <XCircle className="w-3 h-3 mr-1" />
                      未出现
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
