const STORAGE_PREFIX = 'cgm_active_log_file_id:';

export function getActiveLogFileId(projectId: string): string | null {
  if (!projectId) return null;
  if (typeof window === 'undefined') return null;
  try {
    const value = localStorage.getItem(`${STORAGE_PREFIX}${projectId}`);
    return value?.trim() ? value.trim() : null;
  } catch {
    return null;
  }
}

export function setActiveLogFileId(projectId: string, logFileId: string | null) {
  if (!projectId) return;
  if (typeof window === 'undefined') return;
  try {
    const key = `${STORAGE_PREFIX}${projectId}`;
    const normalized = logFileId?.trim() ?? '';
    if (!normalized) {
      localStorage.removeItem(key);
      return;
    }
    localStorage.setItem(key, normalized);
  } catch {
    // ignore
  }
}

