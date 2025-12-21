export const PROJECTS_REFRESH_EVENT = 'cgm_projects_refresh';

export function emitProjectsRefresh() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(PROJECTS_REFRESH_EVENT));
}

