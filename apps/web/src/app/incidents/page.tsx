'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle,
  Plus,
  RefreshCw,
  CheckCircle2,
  Clock,
  Search,
  Loader2,
  AlertCircle,
  Link as LinkIcon,
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

type IncidentRow = {
  id: string;
  title: string;
  severity: string;
  status: string;
  startTime: string;
  endTime: string | null;
  logEventCount: number;
  updatedAt: string;
};

function nowIso() {
  return new Date().toISOString();
}

function getSeverityBadge(severity: string) {
  switch (severity) {
    case 'critical':
      return <Badge variant="destructive">Critical</Badge>;
    case 'high':
      return <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30">High</Badge>;
    case 'medium':
      return <Badge variant="warning">Medium</Badge>;
    case 'low':
      return <Badge variant="secondary">Low</Badge>;
    default:
      return <Badge variant="outline">{severity}</Badge>;
  }
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'open':
      return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Open</Badge>;
    case 'investigating':
      return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">Investigating</Badge>;
    case 'resolved':
      return <Badge variant="success">Resolved</Badge>;
    case 'closed':
      return <Badge variant="secondary">Closed</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export default function IncidentsPage() {
  const { localeTag, t } = useI18n();
  const [projectId, setProjectId] = useState('');
  const [rows, setRows] = useState<IncidentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [title, setTitle] = useState('');
  const [severity, setSeverity] = useState('high');
  const [status, setStatus] = useState('open');
  const [startTime, setStartTime] = useState(nowIso());
  const [endTime, setEndTime] = useState<string>('');
  const [logEventIds, setLogEventIds] = useState<string>('');
  const [success, setSuccess] = useState('');
  const [showForm, setShowForm] = useState(false);

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
      const data = await apiFetch<IncidentRow[]>(`/api/incidents?projectId=${projectId}`);
      setRows(data);
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

  const handleCreate = async () => {
    setSuccess('');
    setError('');
    setLoading(true);
    try {
      const ids = logEventIds
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await apiFetch<{ id: string; status: string }>('/api/incidents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          title: title.trim(),
          severity,
          status,
          startTime,
          endTime: endTime.trim() ? endTime.trim() : undefined,
          logEventIds: ids.length > 0 ? ids : undefined,
        }),
      });
      setSuccess(`created id=${res.id}, status=${res.status}`);
      setTitle('');
      setLogEventIds('');
      setShowForm(false);
      await load();
    } catch (e: unknown) {
      const msg = e instanceof ApiClientError ? `${e.code}: ${e.message}` : String(e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleResolve = async (id: string) => {
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      const res = await apiFetch<{ id: string; status: string }>(`/api/incidents/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'resolved', endTime: new Date().toISOString() }),
      });
      setSuccess(`updated id=${res.id}, status=${res.status}`);
      await load();
    } catch (e: unknown) {
      const msg = e instanceof ApiClientError ? `${e.code}: ${e.message}` : String(e);
      setError(msg);
    } finally {
      setLoading(false);
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
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold gradient-text">{t('incidents.title')}</h1>
            <p className="text-sm text-muted-foreground">
              {loading ? t('common.loading') : t('common.items', { count: rows.length })}
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
            className="gap-2"
          >
            <Plus size={16} />
            {t('common.create')}
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

      {/* Create Form */}
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
                  {t('common.create')} {t('incidents.title')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="text-xs text-muted-foreground mb-1 block">{t('incidents.titleLabel')}</label>
                    <Input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="e.g. BLE reconnect failure"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">{t('incidents.severity')}</label>
                    <select
                      className="w-full h-10 px-3 rounded-md bg-background/50 border border-border/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                      value={severity}
                      onChange={(e) => setSeverity(e.target.value)}
                    >
                      <option value="low">{t('severity.low')}</option>
                      <option value="medium">{t('severity.medium')}</option>
                      <option value="high">{t('severity.high')}</option>
                      <option value="critical">{t('severity.critical')}</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">{t('incidents.status')}</label>
                    <select
                      className="w-full h-10 px-3 rounded-md bg-background/50 border border-border/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                    >
                      <option value="open">{t('incidentStatus.open')}</option>
                      <option value="investigating">{t('incidentStatus.investigating')}</option>
                      <option value="resolved">{t('incidentStatus.resolved')}</option>
                      <option value="closed">{t('incidentStatus.closed')}</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">{t('incidents.startTime')}</label>
                    <Input
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      placeholder={nowIso()}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">{t('incidents.endTime')}</label>
                    <Input
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      placeholder="2025-01-02T12:00:00Z"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-xs text-muted-foreground mb-1 block">{t('incidents.logEventIds')}</label>
                    <textarea
                      className="w-full min-h-[80px] px-3 py-2 rounded-md bg-background/50 border border-border/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-y"
                      value={logEventIds}
                      onChange={(e) => setLogEventIds(e.target.value)}
                      placeholder="uuid, uuid, uuid"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Button
                    onClick={() => void handleCreate()}
                    disabled={!projectId || !title.trim() || loading}
                    className="gap-2"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus size={16} />}
                    {t('common.create')}
                  </Button>
                  <Button variant="ghost" onClick={() => setShowForm(false)}>
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

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

      {/* Incidents List */}
      <motion.div
        variants={fadeIn}
        initial="initial"
        animate="animate"
        transition={{ delay: 0.2 }}
      >
        <Card className="glass border-border/50">
          <CardContent className="p-0">
            {loading && rows.length === 0 ? (
              <div className="p-4 space-y-3">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : rows.length === 0 ? (
              <div className="p-8 text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted/50 flex items-center justify-center">
                  <Search size={24} className="text-muted-foreground" />
                </div>
                <p className="text-muted-foreground">{t('incidents.empty')}</p>
              </div>
            ) : (
              <motion.div
                variants={staggerContainer}
                initial="initial"
                animate="animate"
                className="divide-y divide-border/50"
              >
                {rows.map((incident, index) => (
                  <motion.div
                    key={incident.id}
                    variants={staggerItem}
                    custom={index}
                    className="p-4 hover:bg-primary/5 transition-colors"
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 flex-wrap mb-2">
                          <h3 className="font-medium text-foreground">{incident.title}</h3>
                          {getSeverityBadge(incident.severity)}
                          {getStatusBadge(incident.status)}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock size={14} />
                            {new Date(incident.updatedAt).toLocaleString(localeTag)}
                          </span>
                          <span className="flex items-center gap-1">
                            <LinkIcon size={14} />
                            {incident.logEventCount} events
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {incident.status !== 'resolved' && incident.status !== 'closed' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void handleResolve(incident.id)}
                            disabled={loading}
                            className="gap-2"
                          >
                            <CheckCircle2 size={14} />
                            {t('incidents.markResolved')}
                          </Button>
                        )}
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
