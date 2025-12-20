const TOKEN_KEY = 'cgm_token';
const PROJECT_KEY = 'cgm_project_id';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(TOKEN_KEY);
}

export function getProjectId(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(PROJECT_KEY);
}

export function setProjectId(projectId: string) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(PROJECT_KEY, projectId);
}

export function clearProjectId() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(PROJECT_KEY);
}

