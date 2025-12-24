'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileBarChart,
  Plus,
  RefreshCw,
  Eye,
  Download,
  X,
  Loader2,
  Search,
  AlertCircle,
  CheckCircle2,
  Clock,
  FileText,
  BarChart3,
  User,
} from 'lucide-react';
import { ProjectPicker } from '@/components/ProjectPicker';
import { ApiClientError, apiFetch } from '@/lib/api';
import { getProjectId } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { fadeIn, staggerContainer, staggerItem } from '@/lib/animations';
import { cn } from '@/lib/utils';

type ReportType = 'session_analysis' | 'device_comparison' | 'incident_summary' | 'error_distribution' | 'performance_analysis';

type AnalysisReport = {
  id: string;
  title: string;
  reportType: ReportType;
  summary: string | null;
  sourceData: Record<string, unknown>;
  createdAt: string;
  creator?: { name: string; email: string } | null;
};

const REPORT_TYPES: ReportType[] = ['session_analysis', 'error_distribution'];

function formatDate(iso: string, locale: string) {
  return new Date(iso).toLocaleString(locale);
}

function getReportTypeBadge(type: ReportType) {
  switch (type) {
    case 'session_analysis':
      return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">Session</Badge>;
    case 'error_distribution':
      return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Error</Badge>;
    case 'device_comparison':
      return <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30">Device</Badge>;
    case 'incident_summary':
      return <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30">Incident</Badge>;
    case 'performance_analysis':
      return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Performance</Badge>;
    default:
      return <Badge variant="outline">{type}</Badge>;
  }
}

function getReportIcon(type: ReportType) {
  switch (type) {
    case 'session_analysis':
      return <FileText className="w-5 h-5 text-blue-400" />;
    case 'error_distribution':
      return <BarChart3 className="w-5 h-5 text-red-400" />;
    default:
      return <FileBarChart className="w-5 h-5 text-muted-foreground" />;
  }
}

export default function ReportsPage() {
  const { t, localeTag } = useI18n();
  const [projectId, setProjectId] = useState('');
  const [reports, setReports] = useState<AnalysisReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Generate form
  const [showForm, setShowForm] = useState(false);
  const [reportType, setReportType] = useState<ReportType>('session_analysis');
  const [linkCode, setLinkCode] = useState('');
  const [deviceMac, setDeviceMac] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [reportTitle, setReportTitle] = useState('');

  // View report
  const [viewReport, setViewReport] = useState<AnalysisReport | null>(null);
  const [reportContent, setReportContent] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setProjectId(getProjectId() ?? '');
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch<{ reports: AnalysisReport[] }>(`/api/reports?projectId=${projectId}`);
      setReports(data.reports);
    } catch (e: unknown) {
      const msg = e instanceof ApiClientError ? `${e.code}: ${e.message}` : String(e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleGenerate = async () => {
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      const body: Record<string, unknown> = {
        projectId,
        reportType,
        title: reportTitle.trim() || undefined,
      };

      if (reportType === 'session_analysis') {
        if (!linkCode.trim()) {
          setError('linkCode is required for session analysis');
          setLoading(false);
          return;
        }
        body.linkCode = linkCode.trim();
      } else if (reportType === 'error_distribution') {
        if (!startTime || !endTime) {
          setError('startTime and endTime are required for error distribution');
          setLoading(false);
          return;
        }
        body.startTime = startTime;
        body.endTime = endTime;
        if (deviceMac.trim()) {
          body.deviceMac = deviceMac.trim();
        }
      }

      await apiFetch('/api/reports/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      setSuccess(t('reports.created'));
      setShowForm(false);
      setReportTitle('');
      setLinkCode('');
      setDeviceMac('');
      setStartTime('');
      setEndTime('');
      await load();
    } catch (e: unknown) {
      const msg = e instanceof ApiClientError ? `${e.code}: ${e.message}` : String(e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleView = async (report: AnalysisReport) => {
    setError('');
    setLoading(true);
    try {
      const data = await apiFetch<AnalysisReport & { content: Record<string, unknown> }>(
        `/api/reports/${report.id}?projectId=${projectId}`
      );
      setViewReport(data);
      setReportContent(data.content);
    } catch (e: unknown) {
      const msg = e instanceof ApiClientError ? `${e.code}: ${e.message}` : String(e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async (report: AnalysisReport) => {
    setError('');
    try {
      const data = await apiFetch<{ markdown: string }>(
        `/api/reports/${report.id}/export?projectId=${projectId}`
      );
      const blob = new Blob([data.markdown], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${report.title.replace(/[^a-zA-Z0-9]/g, '_')}.md`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      const msg = e instanceof ApiClientError ? `${e.code}: ${e.message}` : String(e);
      setError(msg);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <motion.div
        variants={fadeIn}
        initial="initial"
        animate="animate"
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
            <FileBarChart className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold gradient-text">{t('reports.title')}</h1>
            <p className="text-sm text-muted-foreground">
              {loading ? t('common.loading') : t('common.items', { count: reports.length })}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={!projectId || loading}
            className="gap-2"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw size={16} />}
            {t('common.refresh')}
          </Button>
          <Button
            size="sm"
            onClick={() => setShowForm(!showForm)}
            disabled={!projectId}
            className="gap-2"
          >
            <Plus size={16} />
            {t('reports.generate')}
          </Button>
        </div>
      </motion.div>

      {/* Project Picker */}
      <motion.div
        variants={fadeIn}
        initial="initial"
        animate="animate"
        transition={{ delay: 0.1 }}
      >
        <Card className="glass border-border/50">
          <CardContent className="p-4">
            <ProjectPicker projectId={projectId} onChange={setProjectId} />
          </CardContent>
        </Card>
      </motion.div>

      {/* Success/Error Messages */}
      <AnimatePresence>
        {success && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm"
          >
            <CheckCircle2 size={16} />
            {success}
          </motion.div>
        )}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm"
          >
            <AlertCircle size={16} />
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Generate Form */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <Card className="glass border-border/50 border-primary/30">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Plus size={18} />
                  {t('reports.generate')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">{t('reports.type')}</label>
                    <select
                      className="w-full h-10 px-3 rounded-md bg-background/50 border border-border/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                      value={reportType}
                      onChange={(e) => setReportType(e.target.value as ReportType)}
                    >
                      {REPORT_TYPES.map((rt) => (
                        <option key={rt} value={rt}>{t(`reportType.${rt}`)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">{t('table.title')}</label>
                    <Input
                      value={reportTitle}
                      onChange={(e) => setReportTitle(e.target.value)}
                      placeholder="Optional title..."
                    />
                  </div>

                  {reportType === 'session_analysis' && (
                    <div className="md:col-span-2">
                      <label className="text-xs text-muted-foreground mb-1 block">{t('reports.linkCode')}</label>
                      <Input
                        value={linkCode}
                        onChange={(e) => setLinkCode(e.target.value)}
                        placeholder="e.g. abc123"
                      />
                    </div>
                  )}

                  {reportType === 'error_distribution' && (
                    <>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">{t('reports.startTime')}</label>
                        <Input
                          type="datetime-local"
                          value={startTime ? new Date(startTime).toISOString().slice(0, 16) : ''}
                          onChange={(e) => setStartTime(e.target.value ? new Date(e.target.value).toISOString() : '')}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">{t('reports.endTime')}</label>
                        <Input
                          type="datetime-local"
                          value={endTime ? new Date(endTime).toISOString().slice(0, 16) : ''}
                          onChange={(e) => setEndTime(e.target.value ? new Date(e.target.value).toISOString() : '')}
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="text-xs text-muted-foreground mb-1 block">
                          {t('reports.deviceMac')} ({t('common.optional')})
                        </label>
                        <Input
                          value={deviceMac}
                          onChange={(e) => setDeviceMac(e.target.value)}
                          placeholder="e.g. AA:BB:CC:DD:EE:FF"
                        />
                      </div>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <Button
                    onClick={() => void handleGenerate()}
                    disabled={loading}
                    className="gap-2"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus size={16} />}
                    {t('reports.generate')}
                  </Button>
                  <Button variant="ghost" onClick={() => setShowForm(false)}>
                    {t('common.close')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* View Report Detail */}
      <AnimatePresence>
        {viewReport && reportContent && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.2 }}
          >
            <Card className="glass border-border/50 border-primary/30">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {getReportIcon(viewReport.reportType)}
                    <div>
                      <CardTitle className="text-base">{viewReport.title}</CardTitle>
                      <div className="flex items-center gap-2 mt-1">
                        {getReportTypeBadge(viewReport.reportType)}
                        <span className="text-xs text-muted-foreground">
                          {formatDate(viewReport.createdAt, localeTag)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setViewReport(null);
                      setReportContent(null);
                    }}
                  >
                    <X size={18} />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {viewReport.summary && (
                  <p className="text-sm text-muted-foreground p-3 rounded-lg bg-muted/30">
                    {viewReport.summary}
                  </p>
                )}
                <div className="rounded-lg bg-background/50 border border-border/50 p-4 overflow-auto max-h-[400px]">
                  <pre className="text-xs font-mono text-foreground/80">
                    {JSON.stringify(reportContent, null, 2)}
                  </pre>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reports List */}
      <motion.div
        variants={fadeIn}
        initial="initial"
        animate="animate"
        transition={{ delay: 0.2 }}
      >
        <Card className="glass border-border/50">
          <CardContent className="p-0">
            {loading && reports.length === 0 ? (
              <div className="p-4 space-y-3">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            ) : reports.length === 0 ? (
              <div className="p-8 text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted/50 flex items-center justify-center">
                  <Search size={24} className="text-muted-foreground" />
                </div>
                <p className="text-muted-foreground">{t('reports.empty')}</p>
              </div>
            ) : (
              <motion.div
                variants={staggerContainer}
                initial="initial"
                animate="animate"
                className="divide-y divide-border/50"
              >
                {reports.map((report, index) => (
                  <motion.div
                    key={report.id}
                    variants={staggerItem}
                    custom={index}
                    className="p-4 hover:bg-primary/5 transition-colors"
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className="w-10 h-10 rounded-lg bg-muted/50 flex items-center justify-center flex-shrink-0">
                          {getReportIcon(report.reportType)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <h3 className="font-medium text-foreground truncate">{report.title}</h3>
                            {getReportTypeBadge(report.reportType)}
                          </div>
                          {report.summary && (
                            <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                              {report.summary}
                            </p>
                          )}
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Clock size={12} />
                              {formatDate(report.createdAt, localeTag)}
                            </span>
                            {report.creator && (
                              <span className="flex items-center gap-1">
                                <User size={12} />
                                {report.creator.name}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void handleView(report)}
                          disabled={loading}
                          className="gap-2"
                        >
                          <Eye size={14} />
                          {t('reports.view')}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void handleExport(report)}
                          className="gap-2"
                        >
                          <Download size={14} />
                          {t('reports.export')}
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
