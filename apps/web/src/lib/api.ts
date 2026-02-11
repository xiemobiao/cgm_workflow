import { API_BASE_URL } from './config';
import { getToken, clearToken } from './auth';

export type ApiError = { code: string; message: string };
export type ApiResponse<T> =
  | { success: true; data: T; error: null }
  | { success: false; data: null; error: ApiError };

export class ApiClientError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(params: { code: string; message: string; status: number }) {
    super(params.message);
    this.name = 'ApiClientError';
    this.code = params.code;
    this.status = params.status;
  }
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit & { skipAuth?: boolean },
): Promise<T> {
  const url = `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;

  const headers = new Headers(init?.headers);
  headers.set('Accept', 'application/json');

  if (!init?.skipAuth) {
    const token = getToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(url, { ...init, headers });

  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    // ignore
  }

  if (!json || typeof json !== 'object') {
    throw new ApiClientError({
      code: 'INVALID_RESPONSE',
      message: `Invalid response (${res.status})`,
      status: res.status,
    });
  }

  const body = json as Partial<ApiResponse<T>>;
  if (body.success === true) return body.data as T;

  const code = body.error?.code ?? `HTTP_${res.status}`;
  const message = body.error?.message ?? 'Request failed';

  if (res.status === 401) {
    clearToken();
    if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
      window.location.replace('/login');
    }
  }

  throw new ApiClientError({ code, message, status: res.status });
}
