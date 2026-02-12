'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  HelpCircle,
  Plus,
  RefreshCw,
  CheckCircle2,
  Search,
  Loader2,
  AlertCircle,
  Edit2,
  Trash2,
  X,
  ToggleLeft,
  ToggleRight,
  Code,
  Target,
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

type IssueCategory = 'connection' | 'data' | 'device' | 'app' | 'permission' | 'protocol' | 'other';

type KnownIssue = {
  id: string;
  title: string;
  description: string;
  solution: string;
  category: IssueCategory;
  severity: number;
  errorCode: string | null;
  eventPattern: string | null;
  msgPattern: string | null;
  hitCount: number;
  isActive: boolean;
  createdAt: string;
  creator?: { name: string; email: string } | null;
};

const CATEGORIES: IssueCategory[] = ['connection', 'data', 'device', 'app', 'permission', 'protocol', 'other'];

function getCategoryBadge(category: string) {
  const colors: Record<string, string> = {
    connection: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    data: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    device: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
    app: 'bg-green-500/20 text-green-400 border-green-500/30',
    permission: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    protocol: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    other: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  };
  return <Badge className={colors[category] || colors.other}>{category}</Badge>;
}

function getSeverityBadge(severity: number) {
  if (severity >= 5) return <Badge variant="destructive">Critical ({severity})</Badge>;
  if (severity >= 4) return <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30">High ({severity})</Badge>;
  if (severity >= 3) return <Badge variant="warning">Medium ({severity})</Badge>;
  if (severity >= 2) return <Badge variant="info">Low ({severity})</Badge>;
  return <Badge variant="secondary">Minimal ({severity})</Badge>;
}

export default function KnownIssuesPage() {
  const { t } = useI18n();
  const [projectId, setProjectId] = useState('');
  const [issues, setIssues] = useState<KnownIssue[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [solution, setSolution] = useState('');
  const [category, setCategory] = useState<IssueCategory>('other');
  const [severity, setSeverity] = useState(2);
  const [errorCode, setErrorCode] = useState('');
  const [eventPattern, setEventPattern] = useState('');
  const [msgPattern, setMsgPattern] = useState('');

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
      const data = await apiFetch<{ items: KnownIssue[] }>(`/api/known-issues?projectId=${projectId}`);
      setIssues(data.items);
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

  const resetForm = () => {
    setEditId(null);
    setTitle('');
    setDescription('');
    setSolution('');
    setCategory('other');
    setSeverity(2);
    setErrorCode('');
    setEventPattern('');
    setMsgPattern('');
  };

  const openCreateForm = () => {
    resetForm();
    setShowForm(true);
  };

  const openEditForm = (issue: KnownIssue) => {
    setEditId(issue.id);
    setTitle(issue.title);
    setDescription(issue.description);
    setSolution(issue.solution);
    setCategory(issue.category);
    setSeverity(issue.severity);
    setErrorCode(issue.errorCode ?? '');
    setEventPattern(issue.eventPattern ?? '');
    setMsgPattern(issue.msgPattern ?? '');
    setShowForm(true);
  };

  const handleSubmit = async () => {
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      const body = {
        projectId,
        title: title.trim(),
        description: description.trim(),
        solution: solution.trim(),
        category,
        severity,
        errorCode: errorCode.trim() || undefined,
        eventPattern: eventPattern.trim() || undefined,
        msgPattern: msgPattern.trim() || undefined,
      };

      if (editId) {
        await apiFetch(`/api/known-issues/${editId}?projectId=${projectId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        setSuccess(t('knownIssues.updated'));
      } else {
        await apiFetch('/api/known-issues', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        setSuccess(t('knownIssues.created'));
      }
      resetForm();
      setShowForm(false);
      await load();
    } catch (e: unknown) {
      const msg = e instanceof ApiClientError ? `${e.code}: ${e.message}` : String(e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (issue: KnownIssue) => {
    if (!window.confirm(t('knownIssues.deleteConfirm', { title: issue.title }))) return;
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      await apiFetch(`/api/known-issues/${issue.id}?projectId=${projectId}`, {
        method: 'DELETE',
      });
      setSuccess(t('knownIssues.deleted'));
      await load();
    } catch (e: unknown) {
      const msg = e instanceof ApiClientError ? `${e.code}: ${e.message}` : String(e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const toggleActive = async (issue: KnownIssue) => {
    setError('');
    setLoading(true);
    try {
      await apiFetch(`/api/known-issues/${issue.id}?projectId=${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !issue.isActive }),
      });
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
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center">
            <HelpCircle className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold gradient-text">{t('knownIssues.title')}</h1>
            <p className="text-sm text-muted-foreground">
              {t('knownIssues.desc')}
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
            onClick={openCreateForm}
            disabled={!projectId}
            className="gap-2"
          >
            <Plus size={16} />
            {t('knownIssues.create')}
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

      {/* Create/Edit Form */}
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
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    {editId ? <Edit2 size={18} /> : <Plus size={18} />}
                    {editId ? t('knownIssues.edit') : t('knownIssues.create')}
                  </CardTitle>
                  <Button variant="ghost" size="icon" onClick={() => { resetForm(); setShowForm(false); }}>
                    <X size={18} />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="text-xs text-muted-foreground mb-1 block">{t('knownIssues.titleLabel')}</label>
                    <Input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="e.g. BLE connection timeout"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-xs text-muted-foreground mb-1 block">{t('knownIssues.description')}</label>
                    <textarea
                      className="w-full min-h-[80px] px-3 py-2 rounded-md bg-background/50 border border-border/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-y"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Describe the issue..."
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-xs text-muted-foreground mb-1 block">{t('knownIssues.solution')}</label>
                    <textarea
                      className="w-full min-h-[80px] px-3 py-2 rounded-md bg-background/50 border border-border/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-y"
                      value={solution}
                      onChange={(e) => setSolution(e.target.value)}
                      placeholder="How to fix this issue..."
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">{t('knownIssues.category')}</label>
                    <select
                      className="w-full h-10 px-3 rounded-md bg-background/50 border border-border/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                      value={category}
                      onChange={(e) => setCategory(e.target.value as IssueCategory)}
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>{t(`issueCategory.${c}`)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">{t('knownIssues.severity')}</label>
                    <select
                      className="w-full h-10 px-3 rounded-md bg-background/50 border border-border/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                      value={severity}
                      onChange={(e) => setSeverity(Number(e.target.value))}
                    >
                      {[1, 2, 3, 4, 5].map((s) => (
                        <option key={s} value={s}>{s} - {s >= 5 ? 'Critical' : s >= 4 ? 'High' : s >= 3 ? 'Medium' : s >= 2 ? 'Low' : 'Minimal'}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">{t('knownIssues.errorCode')}</label>
                    <Input
                      value={errorCode}
                      onChange={(e) => setErrorCode(e.target.value)}
                      placeholder="e.g. ERR_BLE_TIMEOUT"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">{t('knownIssues.eventPattern')}</label>
                    <Input
                      value={eventPattern}
                      onChange={(e) => setEventPattern(e.target.value)}
                      placeholder="e.g. BLE_.*_TIMEOUT"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-xs text-muted-foreground mb-1 block">{t('knownIssues.msgPattern')}</label>
                    <Input
                      value={msgPattern}
                      onChange={(e) => setMsgPattern(e.target.value)}
                      placeholder="e.g. connection failed"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Button
                    onClick={() => void handleSubmit()}
                    disabled={!title.trim() || !description.trim() || !solution.trim() || loading}
                    className="gap-2"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : editId ? <Edit2 size={16} /> : <Plus size={16} />}
                    {editId ? t('knownIssues.edit') : t('common.create')}
                  </Button>
                  <Button variant="ghost" onClick={() => { resetForm(); setShowForm(false); }}>
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

      {/* Issues List */}
      <motion.div
        variants={fadeIn}
        initial="initial"
        animate="animate"
        transition={{ delay: 0.2 }}
      >
        <Card className="glass border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {loading ? t('common.loading') : t('common.items', { count: issues.length })}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading && issues.length === 0 ? (
              <div className="p-4 space-y-3">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            ) : issues.length === 0 ? (
              <div className="p-8 text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted/50 flex items-center justify-center">
                  <Search size={24} className="text-muted-foreground" />
                </div>
                <p className="text-muted-foreground">{t('knownIssues.empty')}</p>
              </div>
            ) : (
              <motion.div
                variants={staggerContainer}
                initial="initial"
                animate="animate"
                className="divide-y divide-border/50"
              >
                {issues.map((issue, index) => (
                  <motion.div
                    key={issue.id}
                    variants={staggerItem}
                    custom={index}
                    className={cn(
                      'p-4 hover:bg-primary/5 transition-colors',
                      !issue.isActive && 'opacity-50'
                    )}
                  >
                    <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-center gap-3 flex-wrap">
                          <h3 className="font-medium text-foreground">{issue.title}</h3>
                          {getCategoryBadge(issue.category)}
                          {getSeverityBadge(issue.severity)}
                          {!issue.isActive && <Badge variant="outline">Inactive</Badge>}
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {issue.description}
                        </p>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          {issue.errorCode && (
                            <span className="flex items-center gap-1 font-mono">
                              <Code size={12} />
                              {issue.errorCode}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <Target size={12} />
                            {issue.hitCount} hits
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => void toggleActive(issue)}
                          title={issue.isActive ? 'Deactivate' : 'Activate'}
                        >
                          {issue.isActive ? <ToggleRight size={18} className="text-emerald-400" /> : <ToggleLeft size={18} />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditForm(issue)}
                        >
                          <Edit2 size={16} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => void handleDelete(issue)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 size={16} />
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
