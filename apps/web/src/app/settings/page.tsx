'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Settings,
  RefreshCw,
  Plus,
  Copy,
  Check,
  Users,
  Archive,
  RotateCcw,
  Edit3,
  Trash2,
  X,
  Loader2,
  AlertCircle,
  CheckCircle2,
  FolderOpen,
  Search,
  Server,
  Key,
  Folder,
} from 'lucide-react';
import { API_BASE_URL } from '@/lib/config';
import { clearProjectId, getProjectId, getToken, setProjectId } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { ApiClientError, apiFetch } from '@/lib/api';
import { emitProjectsRefresh } from '@/lib/projects';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { fadeIn, staggerContainer, staggerItem } from '@/lib/animations';
import { cn } from '@/lib/utils';
import { ConfirmDialog } from '@/components/ConfirmDialog';

type ProjectRow = {
  id: string;
  name: string;
  type: string;
  status: string;
  role: string;
};

type ProjectMemberRow = {
  userId: string;
  email: string;
  name: string;
  role: string;
  createdAt: string;
};

const ROLE_OPTIONS = ['Admin', 'PM', 'Dev', 'QA', 'Release', 'Support', 'Viewer'] as const;

export default function SettingsPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [token, setToken] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectsError, setProjectsError] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [copyHint, setCopyHint] = useState('');

  const [membersProject, setMembersProject] = useState<ProjectRow | null>(null);
  const [members, setMembers] = useState<ProjectMemberRow[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState('');
  const [membersHint, setMembersHint] = useState('');
  const [memberEmail, setMemberEmail] = useState('');
  const [memberRole, setMemberRole] = useState<(typeof ROLE_OPTIONS)[number]>('Viewer');
  const [memberSaving, setMemberSaving] = useState(false);

  const [createName, setCreateName] = useState('');
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createSuccess, setCreateSuccess] = useState('');
  const [createSetAsCurrent, setCreateSetAsCurrent] = useState(true);

  // Confirm dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title?: string;
    description: string;
    variant?: 'default' | 'destructive';
    onConfirm: () => void | Promise<void>;
  }>({
    open: false,
    description: '',
    onConfirm: () => {},
  });

  function showConfirm(options: {
    title?: string;
    description: string;
    variant?: 'default' | 'destructive';
    onConfirm: () => void | Promise<void>;
  }) {
    setConfirmDialog({ open: true, ...options });
  }

  useEffect(() => {
    const id = window.setTimeout(() => {
      setToken(getToken());
      setSelectedProjectId(getProjectId());
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  async function loadProjects() {
    setProjectsLoading(true);
    setProjectsError('');
    try {
      const rows = await apiFetch<ProjectRow[]>('/api/projects');
      setProjects(rows);
    } catch (e: unknown) {
      const msg = e instanceof ApiClientError ? `${e.code}: ${e.message}` : String(e);
      setProjectsError(msg);
      setProjects([]);
    } finally {
      setProjectsLoading(false);
    }
  }

  useEffect(() => {
    void loadProjects();
  }, []);

  const visibleProjects = useMemo(() => {
    const q = projectFilter.trim().toLowerCase();
    const filtered = q
      ? projects.filter((p) => {
          const hay = [p.name, p.id, p.type, p.status, p.role]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          return hay.includes(q);
        })
      : projects;

    return filtered.slice().sort((a, b) => {
      const aCurrent = selectedProjectId === a.id;
      const bCurrent = selectedProjectId === b.id;
      if (aCurrent !== bCurrent) return aCurrent ? -1 : 1;
      const aArchived = a.status === 'archived';
      const bArchived = b.status === 'archived';
      if (aArchived !== bArchived) return aArchived ? 1 : -1;
      return a.name.localeCompare(b.name);
    });
  }, [projectFilter, projects, selectedProjectId]);

  async function copyText(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopyHint(t('common.copied'));
    } catch {
      setCopyHint(t('common.copyFailed'));
    }
    window.setTimeout(() => setCopyHint(''), 1200);
  }

  async function loadMembers(projectId: string) {
    setMembersLoading(true);
    setMembersError('');
    try {
      const rows = await apiFetch<ProjectMemberRow[]>(`/api/projects/${projectId}/members`);
      setMembers(rows);
    } catch (e: unknown) {
      const msg = e instanceof ApiClientError ? `${e.code}: ${e.message}` : String(e);
      setMembersError(msg);
      setMembers([]);
    } finally {
      setMembersLoading(false);
    }
  }

  function openMembersDrawer(project: ProjectRow) {
    setMembersProject(project);
    setMembers([]);
    setMembersError('');
    setMembersHint('');
    setMemberEmail('');
    setMemberRole('Viewer');
    void loadMembers(project.id);
  }

  function closeMembersDrawer() {
    setMembersProject(null);
    setMembers([]);
    setMembersError('');
    setMembersHint('');
  }

  function setMembersToast(msg: string) {
    setMembersHint(msg);
    window.setTimeout(() => setMembersHint(''), 1200);
  }

  async function addOrUpdateMember(project: ProjectRow, input: { email?: string; userId?: string; role: string }) {
    setMembersError('');
    setMemberSaving(true);
    try {
      await apiFetch(`/api/projects/${project.id}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      setMembersToast(t('settings.members.updated'));
      setMemberEmail('');
      await loadMembers(project.id);
      await loadProjects();
      emitProjectsRefresh();
    } catch (e: unknown) {
      const msg = e instanceof ApiClientError ? `${e.code}: ${e.message}` : String(e);
      setMembersError(msg);
    } finally {
      setMemberSaving(false);
    }
  }

  async function removeMember(project: ProjectRow, userId: string, email: string) {
    setMembersError('');
    setMemberSaving(true);
    try {
      await apiFetch(`/api/projects/${project.id}/members/${userId}`, { method: 'DELETE' });
      setMembersToast(t('settings.members.removed', { email }));
      await loadMembers(project.id);
      await loadProjects();
      emitProjectsRefresh();
    } catch (e: unknown) {
      const msg = e instanceof ApiClientError ? `${e.code}: ${e.message}` : String(e);
      setMembersError(msg);
    } finally {
      setMemberSaving(false);
    }
  }

  async function updateProject(projectId: string, patch: { name?: string; status?: string }) {
    setProjectsError('');
    try {
      await apiFetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      setCopyHint(t('settings.projects.updated'));
      window.setTimeout(() => setCopyHint(''), 1200);
      await loadProjects();
      emitProjectsRefresh();
    } catch (e: unknown) {
      const msg = e instanceof ApiClientError ? `${e.code}: ${e.message}` : String(e);
      setProjectsError(msg);
    }
  }

  async function handleCreateProject() {
    setCreateLoading(true);
    setCreateError('');
    setCreateSuccess('');
    try {
      const project = await apiFetch<{ id: string; name: string }>('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: createName.trim(), type: 'App' }),
      });

      setCreateSuccess(t('settings.projects.created', { name: project.name }));
      setCreateName('');
      await loadProjects();
      emitProjectsRefresh();

      if (createSetAsCurrent) {
        setProjectId(project.id);
        setSelectedProjectId(project.id);
      }
    } catch (e: unknown) {
      if (e instanceof ApiClientError && e.code === 'FORBIDDEN_ADMIN_ONLY') {
        setCreateError(t('settings.projects.adminOnly'));
      } else {
        const msg = e instanceof ApiClientError ? `${e.code}: ${e.message}` : String(e);
        setCreateError(msg);
      }
    } finally {
      setCreateLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <motion.div
        variants={fadeIn}
        initial="initial"
        animate="animate"
        className="flex items-center gap-3"
      >
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-gray-500 to-slate-600 flex items-center justify-center">
          <Settings className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold gradient-text">{t('settings.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('settings.projects.desc')}</p>
        </div>
      </motion.div>

      {/* System Info */}
      <motion.div
        variants={fadeIn}
        initial="initial"
        animate="animate"
        transition={{ delay: 0.1 }}
      >
        <Card className="glass border-border/50">
          <CardContent className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <Server size={18} className="text-blue-400" />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">{t('settings.apiBaseUrl')}</div>
                  <div className="text-sm font-mono truncate">{API_BASE_URL}</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                  <Key size={18} className="text-emerald-400" />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">{t('settings.token')}</div>
                  <div className="text-sm">
                    {token ? t('settings.tokenPresent', { count: token.length }) : t('settings.tokenMissing')}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                  <Folder size={18} className="text-purple-400" />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">{t('settings.selectedProjectId')}</div>
                  <div className="text-sm font-mono truncate">
                    {selectedProjectId ? `${selectedProjectId.slice(0, 8)}...` : t('common.none')}
                  </div>
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  clearProjectId();
                  setSelectedProjectId(null);
                }}
              >
                {t('settings.clearProjectSelection')}
              </Button>
              <Button variant="outline" size="sm" onClick={() => router.refresh()}>
                {t('settings.refreshPage')}
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Projects Section */}
      <motion.div
        variants={fadeIn}
        initial="initial"
        animate="animate"
        transition={{ delay: 0.2 }}
      >
        <Card className="glass border-border/50">
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <FolderOpen size={20} />
                {t('settings.projects.title')}
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void loadProjects()}
                  disabled={projectsLoading}
                  className="gap-2"
                >
                  {projectsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw size={16} />}
                  {t('common.refresh')}
                </Button>
                {copyHint && (
                  <span className="text-sm text-emerald-400 flex items-center gap-1">
                    <Check size={14} />
                    {copyHint}
                  </span>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Filter */}
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={projectFilter}
                  onChange={(e) => setProjectFilter(e.target.value)}
                  placeholder={t('settings.projects.filterPlaceholder')}
                  className="pl-10"
                />
              </div>
              <span className="text-sm text-muted-foreground">
                {t('common.items', { count: visibleProjects.length })}
              </span>
            </div>

            {projectsError && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                <AlertCircle size={16} />
                {projectsError}
              </div>
            )}

            {/* Projects List */}
            {projectsLoading && projects.length === 0 ? (
              <div className="space-y-3">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : visibleProjects.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                {projects.length === 0 ? t('settings.projects.empty') : t('settings.projects.noMatch')}
              </div>
            ) : (
              <motion.div
                variants={staggerContainer}
                initial="initial"
                animate="animate"
                className="divide-y divide-border/50 border border-border/50 rounded-lg overflow-hidden"
              >
                {visibleProjects.map((p, index) => {
                  const isCurrent = selectedProjectId === p.id;
                  const isArchived = p.status === 'archived';
                  const canAdmin = p.role === 'Admin';

                  return (
                    <motion.div
                      key={p.id}
                      variants={staggerItem}
                      custom={index}
                      className={cn(
                        'p-4 hover:bg-primary/5 transition-colors',
                        isArchived && 'opacity-60'
                      )}
                    >
                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="font-medium">{p.name}</span>
                            {isCurrent && <Badge variant="success">Current</Badge>}
                            {isArchived && <Badge variant="destructive">Archived</Badge>}
                            <Badge variant="outline">{p.type}</Badge>
                            <Badge variant="secondary">{p.role}</Badge>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="font-mono">{p.id.slice(0, 8)}...</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 gap-1"
                              onClick={() => void copyText(p.id)}
                            >
                              <Copy size={12} />
                              {t('common.copy')}
                            </Button>
                          </div>
                        </div>
                        <div className="flex gap-2 flex-wrap">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openMembersDrawer(p)}
                            className="gap-1"
                          >
                            <Users size={14} />
                            {t('settings.members.open')}
                          </Button>
                          {!isCurrent && !isArchived && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setProjectId(p.id);
                                setSelectedProjectId(p.id);
                              }}
                            >
                              {t('projects.setCurrent')}
                            </Button>
                          )}
                          {canAdmin && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  const next = window.prompt(t('settings.projects.renamePrompt'), p.name);
                                  if (next === null) return;
                                  const name = next.trim();
                                  if (!name) {
                                    setProjectsError(t('settings.projects.renameEmpty'));
                                    return;
                                  }
                                  if (name === p.name) return;
                                  void updateProject(p.id, { name });
                                }}
                              >
                                <Edit3 size={16} />
                              </Button>
                              {isArchived ? (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => {
                                    showConfirm({
                                      description: t('settings.projects.restoreConfirm', { name: p.name }),
                                      onConfirm: () => updateProject(p.id, { status: 'active' }),
                                    });
                                  }}
                                >
                                  <RotateCcw size={16} />
                                </Button>
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="text-destructive hover:text-destructive"
                                  onClick={() => {
                                    const isSelected = selectedProjectId === p.id;
                                    showConfirm({
                                      description: t('settings.projects.archiveConfirm', { name: p.name }),
                                      variant: 'destructive',
                                      onConfirm: async () => {
                                        await updateProject(p.id, { status: 'archived' });
                                        if (isSelected) {
                                          clearProjectId();
                                          setSelectedProjectId(null);
                                        }
                                      },
                                    });
                                  }}
                                >
                                  <Archive size={16} />
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </motion.div>
            )}

            {/* Create Project */}
            <div className="pt-4 border-t border-border/50 space-y-3">
              <div className="text-sm font-medium">{t('settings.projects.createName')}</div>
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex-1 min-w-[200px]">
                  <Input
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                    placeholder="e.g. CGM App - Android"
                  />
                </div>
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={createSetAsCurrent}
                    onChange={(e) => setCreateSetAsCurrent(e.target.checked)}
                    className="rounded"
                  />
                  {t('settings.projects.setAsCurrent')}
                </label>
                <Button
                  onClick={() => void handleCreateProject()}
                  disabled={!createName.trim() || createLoading}
                  className="gap-2"
                >
                  {createLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus size={16} />}
                  {t('settings.projects.createApp')}
                </Button>
              </div>
              {createSuccess && (
                <div className="flex items-center gap-2 text-sm text-emerald-400">
                  <CheckCircle2 size={16} />
                  {createSuccess}
                </div>
              )}
              {createError && (
                <div className="flex items-center gap-2 text-sm text-destructive">
                  <AlertCircle size={16} />
                  {createError}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Members Drawer */}
      <AnimatePresence>
        {membersProject && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
              onClick={closeMembersDrawer}
            />
            <motion.aside
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed right-0 top-0 bottom-0 w-full max-w-xl glass border-l border-border/50 z-50 flex flex-col"
            >
              <div className="flex items-center justify-between p-4 border-b border-border/50">
                <div>
                  <h2 className="font-semibold flex items-center gap-2">
                    <Users size={18} />
                    {t('settings.members.title')}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {membersProject.name} - {membersProject.id.slice(0, 8)}...
                  </p>
                </div>
                <Button variant="ghost" size="icon" onClick={closeMembersDrawer}>
                  <X size={20} />
                </Button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void loadMembers(membersProject.id)}
                    disabled={membersLoading}
                    className="gap-2"
                  >
                    {membersLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw size={16} />}
                    {t('common.refresh')}
                  </Button>
                  <div className="flex items-center gap-2">
                    {membersHint && <span className="text-sm text-emerald-400">{membersHint}</span>}
                    <span className="text-sm text-muted-foreground">
                      {t('common.items', { count: members.length })}
                    </span>
                  </div>
                </div>

                {membersError && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                    <AlertCircle size={16} />
                    {membersError}
                  </div>
                )}

                {/* Members List */}
                {membersLoading && members.length === 0 ? (
                  <div className="space-y-3">
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                  </div>
                ) : members.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">
                    {t('settings.members.empty')}
                  </div>
                ) : (
                  <div className="divide-y divide-border/50 border border-border/50 rounded-lg overflow-hidden">
                    {members.map((m) => {
                      const canAdmin = membersProject.role === 'Admin';
                      return (
                        <div key={m.userId} className="p-3 hover:bg-primary/5 transition-colors">
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="font-medium">{m.name}</div>
                              <div className="text-sm text-muted-foreground">{m.email}</div>
                            </div>
                            <div className="flex items-center gap-2">
                              {canAdmin ? (
                                <select
                                  className="h-8 px-2 rounded-md bg-background/50 border border-border/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                                  value={m.role}
                                  disabled={memberSaving}
                                  onChange={(e) => {
                                    const role = e.target.value;
                                    if (!ROLE_OPTIONS.includes(role as (typeof ROLE_OPTIONS)[number])) return;
                                    void addOrUpdateMember(membersProject, { userId: m.userId, role });
                                  }}
                                >
                                  {ROLE_OPTIONS.map((r) => (
                                    <option key={r} value={r}>{r}</option>
                                  ))}
                                </select>
                              ) : (
                                <Badge variant="secondary">{m.role}</Badge>
                              )}
                              {canAdmin && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  disabled={memberSaving}
                                  className="text-destructive hover:text-destructive"
                                  onClick={() => {
                                    showConfirm({
                                      description: t('settings.members.removeConfirm', {
                                        project: membersProject.name,
                                        email: m.email,
                                      }),
                                      variant: 'destructive',
                                      onConfirm: () => removeMember(membersProject, m.userId, m.email),
                                    });
                                  }}
                                >
                                  <Trash2 size={16} />
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Add Member */}
                {membersProject.role === 'Admin' && (
                  <Card className="glass border-primary/30">
                    <CardContent className="p-4 space-y-3">
                      <div className="text-sm font-medium">{t('settings.members.addTitle')}</div>
                      <div className="flex flex-wrap gap-3">
                        <Input
                          value={memberEmail}
                          onChange={(e) => setMemberEmail(e.target.value)}
                          placeholder="e.g. admin@cgm.local"
                          className="flex-1 min-w-[200px]"
                        />
                        <select
                          className="h-10 px-3 rounded-md bg-background/50 border border-border/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                          value={memberRole}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (!ROLE_OPTIONS.includes(v as (typeof ROLE_OPTIONS)[number])) return;
                            setMemberRole(v as (typeof ROLE_OPTIONS)[number]);
                          }}
                        >
                          {ROLE_OPTIONS.map((r) => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                        <Button
                          onClick={() =>
                            void addOrUpdateMember(membersProject, {
                              email: memberEmail.trim(),
                              role: memberRole,
                            })
                          }
                          disabled={!memberEmail.trim() || memberSaving}
                          className="gap-2"
                        >
                          {memberSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus size={16} />}
                          {t('settings.members.add')}
                        </Button>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {t('settings.members.addHint')}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Confirm Dialog */}
      <ConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog((prev) => ({ ...prev, open }))}
        description={confirmDialog.description}
        title={confirmDialog.title}
        variant={confirmDialog.variant}
        onConfirm={confirmDialog.onConfirm}
      />
    </div>
  );
}
