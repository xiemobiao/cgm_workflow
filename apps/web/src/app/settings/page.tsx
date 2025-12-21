'use client';

import shellStyles from '@/components/AppShell.module.css';
import formStyles from '@/components/Form.module.css';
import { API_BASE_URL } from '@/lib/config';
import { clearProjectId, getProjectId, getToken, setProjectId } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { ApiClientError, apiFetch } from '@/lib/api';
import { emitProjectsRefresh } from '@/lib/projects';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

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

  return (
    <div className={shellStyles.grid}>
      <div className={shellStyles.card}>
        <h1 style={{ fontSize: 20, marginBottom: 8 }}>{t('settings.title')}</h1>
        <div className={shellStyles.grid}>
          <div className={formStyles.field}>
            <div className={formStyles.label}>{t('settings.apiBaseUrl')}</div>
            <div className={formStyles.muted}>{API_BASE_URL}</div>
          </div>
          <div className={formStyles.field}>
            <div className={formStyles.label}>{t('settings.token')}</div>
            <div className={formStyles.muted}>
              {token ? t('settings.tokenPresent', { count: token.length }) : t('settings.tokenMissing')}
            </div>
          </div>
          <div className={formStyles.field}>
            <div className={formStyles.label}>{t('settings.selectedProjectId')}</div>
            <div className={formStyles.muted}>{selectedProjectId ?? t('common.none')}</div>
          </div>
          <div className={formStyles.row}>
            <button
              className={shellStyles.button}
              type="button"
              onClick={() => {
                clearProjectId();
                setSelectedProjectId(null);
              }}
            >
              {t('settings.clearProjectSelection')}
            </button>
            <button
              className={shellStyles.button}
              type="button"
              onClick={() => router.refresh()}
            >
              {t('settings.refreshPage')}
            </button>
          </div>
        </div>
      </div>

      <div className={shellStyles.card}>
        <h2 style={{ fontSize: 16, marginBottom: 8 }}>{t('settings.projects.title')}</h2>
        <div className={formStyles.muted} style={{ marginBottom: 10 }}>
          {t('settings.projects.desc')}
        </div>

        <div className={formStyles.row}>
          <button
            className={shellStyles.button}
            type="button"
            disabled={projectsLoading}
            onClick={() => void loadProjects()}
          >
            {t('common.refresh')}
          </button>
          <div className={formStyles.field} style={{ minWidth: 260, flex: '1 1 260px' }}>
            <div className={formStyles.label}>{t('settings.projects.filter')}</div>
            <input
              className={formStyles.input}
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              placeholder={t('settings.projects.filterPlaceholder')}
            />
          </div>
          {copyHint ? <div className={formStyles.muted}>{copyHint}</div> : null}
          {projectsLoading ? <div className={formStyles.muted}>{t('common.loading')}</div> : null}
          {!projectsLoading ? (
            <div className={formStyles.muted}>{t('common.items', { count: visibleProjects.length })}</div>
          ) : null}
        </div>

        {projectsError ? <div className={formStyles.error}>{projectsError}</div> : null}

        <div className={shellStyles.tableWrap} style={{ marginTop: 10 }}>
          <table className={shellStyles.table}>
            <thead>
              <tr>
                <th>{t('projects.name')}</th>
                <th>{t('projects.type')}</th>
                <th>{t('projects.status')}</th>
                <th>{t('projects.role')}</th>
                <th>{t('table.id')}</th>
                <th>{t('table.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {visibleProjects.map((p) => (
                <tr key={p.id}>
                  <td style={{ minWidth: 220 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span>{p.name}</span>
                      {selectedProjectId === p.id ? (
                        <span className={shellStyles.badge}>{t('projects.current')}</span>
                      ) : null}
                    </div>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>{p.type}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <span
                      className={`${shellStyles.badge} ${
                        p.status === 'archived' ? shellStyles.badgeDanger : ''
                      }`}
                    >
                      {p.status}
                    </span>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>{p.role}</td>
                  <td className={formStyles.muted} style={{ whiteSpace: 'nowrap' }}>
                    <div className={formStyles.row} style={{ gap: 8 }}>
                      <span title={p.id}>{p.id.slice(0, 8)}…</span>
                      <button
                        className={shellStyles.badge}
                        type="button"
                        onClick={() => void copyText(p.id)}
                      >
                        {t('common.copy')}
                      </button>
                    </div>
                  </td>
                  <td>
                    {(() => {
                      const isCurrent = selectedProjectId === p.id;
                      const isArchived = p.status === 'archived';
                      const canAdmin = p.role === 'Admin';
                      const canSetCurrent = !isCurrent && !isArchived;
                      const hasActions = true;
                      if (!hasActions) return <span className={formStyles.muted}>—</span>;

                      return (
                        <div className={formStyles.row} style={{ justifyContent: 'flex-end' }}>
                          <button
                            className={shellStyles.button}
                            type="button"
                            disabled={projectsLoading}
                            onClick={() => openMembersDrawer(p)}
                          >
                            {t('settings.members.open')}
                          </button>
                          {canSetCurrent ? (
                            <button
                              className={shellStyles.button}
                              type="button"
                              disabled={projectsLoading}
                              onClick={() => {
                                setProjectId(p.id);
                                setSelectedProjectId(p.id);
                              }}
                            >
                              {t('projects.setCurrent')}
                            </button>
                          ) : null}

                          {canAdmin ? (
                            <>
                              <button
                                className={shellStyles.button}
                                type="button"
                                disabled={projectsLoading}
                                onClick={() => {
                                  const next = window.prompt(
                                    t('settings.projects.renamePrompt'),
                                    p.name,
                                  );
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
                                {t('settings.projects.rename')}
                              </button>

                              {isArchived ? (
                                <button
                                  className={shellStyles.button}
                                  type="button"
                                  disabled={projectsLoading}
                                  onClick={() => {
                                    const ok = window.confirm(
                                      t('settings.projects.restoreConfirm', { name: p.name }),
                                    );
                                    if (!ok) return;
                                    void updateProject(p.id, { status: 'active' });
                                  }}
                                >
                                  {t('settings.projects.restore')}
                                </button>
                              ) : (
                                <button
                                  className={`${shellStyles.button} ${shellStyles.buttonDanger}`}
                                  type="button"
                                  disabled={projectsLoading}
                                  onClick={() => {
                                    const isSelected = selectedProjectId === p.id;
                                    const ok = window.confirm(
                                      t('settings.projects.archiveConfirm', { name: p.name }),
                                    );
                                    if (!ok) return;
                                    void updateProject(p.id, { status: 'archived' }).then(() => {
                                      if (!isSelected) return;
                                      clearProjectId();
                                      setSelectedProjectId(null);
                                    });
                                  }}
                                >
                                  {t('settings.projects.archive')}
                                </button>
                              )}
                            </>
                          ) : null}
                        </div>
                      );
                    })()}
                  </td>
                </tr>
              ))}
              {projects.length === 0 || visibleProjects.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: 10 }} className={formStyles.muted}>
                    {projects.length === 0
                      ? t('settings.projects.empty')
                      : t('settings.projects.noMatch')}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className={shellStyles.grid} style={{ marginTop: 14 }}>
          <div className={formStyles.field}>
            <div className={formStyles.label}>{t('settings.projects.createName')}</div>
            <input
              className={formStyles.input}
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder="e.g. CGM App - Android"
            />
          </div>

          <div className={formStyles.row}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={createSetAsCurrent}
                onChange={(e) => setCreateSetAsCurrent(e.target.checked)}
              />
              <span className={formStyles.muted}>{t('settings.projects.setAsCurrent')}</span>
            </label>

            <button
              className={shellStyles.button}
              type="button"
              disabled={!createName.trim() || createLoading}
              onClick={async () => {
                setCreateLoading(true);
                setCreateError('');
                setCreateSuccess('');
                try {
                  const project = await apiFetch<{ id: string; name: string }>(
                    '/api/projects',
                    {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ name: createName.trim(), type: 'App' }),
                    },
                  );

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
                    const msg =
                      e instanceof ApiClientError ? `${e.code}: ${e.message}` : String(e);
                    setCreateError(msg);
                  }
                } finally {
                  setCreateLoading(false);
                }
              }}
            >
              {t('settings.projects.createApp')}
            </button>

            {createSuccess ? <div className={formStyles.success}>{createSuccess}</div> : null}
          </div>

          {createError ? <div className={formStyles.error}>{createError}</div> : null}
        </div>
      </div>

      {membersProject ? (
        <>
          <div className={shellStyles.drawerOverlay} onClick={closeMembersDrawer} />
          <aside className={shellStyles.drawer} role="dialog" aria-modal="true">
            <div className={shellStyles.drawerHeader}>
              <div>
                <div className={shellStyles.drawerTitle}>{t('settings.members.title')}</div>
                <div className={formStyles.muted}>
                  {membersProject.name} · {membersProject.id.slice(0, 8)}…
                </div>
              </div>
              <button className={shellStyles.button} type="button" onClick={closeMembersDrawer}>
                {t('common.close')}
              </button>
            </div>
            <div className={shellStyles.drawerBody}>
              <div className={formStyles.row} style={{ justifyContent: 'space-between' }}>
                <div className={formStyles.row}>
                  <button
                    className={shellStyles.button}
                    type="button"
                    disabled={membersLoading}
                    onClick={() => void loadMembers(membersProject.id)}
                  >
                    {t('common.refresh')}
                  </button>
                  {membersLoading ? <div className={formStyles.muted}>{t('common.loading')}</div> : null}
                  {membersHint ? <div className={formStyles.muted}>{membersHint}</div> : null}
                </div>
                {!membersLoading ? (
                  <div className={formStyles.muted}>{t('common.items', { count: members.length })}</div>
                ) : null}
              </div>

              {membersError ? <div className={formStyles.error}>{membersError}</div> : null}

              <div className={shellStyles.tableWrap}>
                <table className={shellStyles.table}>
                  <thead>
                    <tr>
                      <th>{t('settings.members.email')}</th>
                      <th>{t('settings.members.name')}</th>
                      <th>{t('settings.members.role')}</th>
                      <th>{t('settings.members.createdAt')}</th>
                      <th>{t('table.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((m) => {
                      const canAdmin = membersProject.role === 'Admin';
                      return (
                        <tr key={m.userId}>
                          <td style={{ whiteSpace: 'nowrap' }}>{m.email}</td>
                          <td style={{ whiteSpace: 'nowrap' }}>{m.name}</td>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            {canAdmin ? (
                              <select
                                className={formStyles.select}
                                value={m.role}
                                disabled={memberSaving}
                                onChange={(e) => {
                                  const role = e.target.value;
                                  if (!ROLE_OPTIONS.includes(role as (typeof ROLE_OPTIONS)[number])) return;
                                  void addOrUpdateMember(membersProject, { userId: m.userId, role });
                                }}
                              >
                                {ROLE_OPTIONS.map((r) => (
                                  <option key={r} value={r}>
                                    {r}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span>{m.role}</span>
                            )}
                          </td>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            {new Date(m.createdAt).toLocaleString()}
                          </td>
                          <td>
                            {canAdmin ? (
                              <div className={formStyles.row} style={{ justifyContent: 'flex-end' }}>
                                <button
                                  className={`${shellStyles.button} ${shellStyles.buttonDanger}`}
                                  type="button"
                                  disabled={memberSaving}
                                  onClick={() => {
                                    const ok = window.confirm(
                                      t('settings.members.removeConfirm', {
                                        project: membersProject.name,
                                        email: m.email,
                                      }),
                                    );
                                    if (!ok) return;
                                    void removeMember(membersProject, m.userId, m.email);
                                  }}
                                >
                                  {t('settings.members.remove')}
                                </button>
                              </div>
                            ) : (
                              <span className={formStyles.muted}>—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {members.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ padding: 10 }} className={formStyles.muted}>
                          {t('settings.members.empty')}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>

              {membersProject.role === 'Admin' ? (
                <div className={shellStyles.card}>
                  <div className={formStyles.muted}>{t('settings.members.addTitle')}</div>
                  <div className={formStyles.row}>
                    <div className={formStyles.field} style={{ minWidth: 260, flex: '1 1 260px' }}>
                      <div className={formStyles.label}>{t('settings.members.email')}</div>
                      <input
                        className={formStyles.input}
                        value={memberEmail}
                        onChange={(e) => setMemberEmail(e.target.value)}
                        placeholder="e.g. admin@cgm.local"
                      />
                    </div>
                    <div className={formStyles.field} style={{ minWidth: 160 }}>
                      <div className={formStyles.label}>{t('settings.members.role')}</div>
                      <select
                        className={formStyles.select}
                        value={memberRole}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (!ROLE_OPTIONS.includes(v as (typeof ROLE_OPTIONS)[number])) return;
                          setMemberRole(v as (typeof ROLE_OPTIONS)[number]);
                        }}
                      >
                        {ROLE_OPTIONS.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      className={shellStyles.button}
                      type="button"
                      disabled={!memberEmail.trim() || memberSaving}
                      onClick={() =>
                        void addOrUpdateMember(membersProject, {
                          email: memberEmail.trim(),
                          role: memberRole,
                        })
                      }
                    >
                      {t('settings.members.add')}
                    </button>
                  </div>
                  <div className={formStyles.muted}>{t('settings.members.addHint')}</div>
                </div>
              ) : null}
            </div>
          </aside>
        </>
      ) : null}
    </div>
  );
}
