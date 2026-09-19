export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}

interface ApiOptions {
  method?: HttpMethod;
  body?: unknown;
  headers?: Record<string, string>;
  formData?: FormData;
  signal?: AbortSignal;
}

let csrfTokenCache: string | null = null;

async function fetchCsrfToken(): Promise<string> {
  const res = await fetch('/api/auth/csrf', { credentials: 'same-origin' });
  if (!res.ok) throw new ApiError(res.status, 'CSRF_UNAVAILABLE', 'Unable to obtain CSRF token.');
  const data = (await res.json()) as { token: string };
  csrfTokenCache = data.token;
  return data.token;
}

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { method = 'GET', body, headers, formData, signal } = options;
  const isMutating = method !== 'GET';

  const finalHeaders: Record<string, string> = { ...headers };
  if (formData) {
    finalHeaders['Content-Type'] = '';
  } else if (body !== undefined) {
    finalHeaders['Content-Type'] = 'application/json';
  }

  if (isMutating) {
    const token = csrfTokenCache ?? (await fetchCsrfToken());
    finalHeaders['X-CSRF-Token'] = token;
  }

  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: finalHeaders,
    body: formData ?? (body !== undefined ? JSON.stringify(body) : undefined),
    signal,
  });

  if (res.status === 204) return undefined as T;

  const payload = (await res.json().catch(() => ({}))) as {
    error?: { code?: string; message?: string };
  } & T;

  if (!res.ok) {
    const err = payload.error;
    // The token may have rotated (login/logout/MFA); retry once with a fresh token.
    if (isMutating && res.status === 403 && err?.code === 'invalid csrf token' && csrfTokenCache) {
      csrfTokenCache = null;
      return api<T>(path, options);
    }
    throw new ApiError(res.status, err?.code ?? 'ERROR', err?.message ?? `Request failed (${res.status})`);
  }

  return payload as T;
}

export const get = <T>(path: string, signal?: AbortSignal) => api<T>(path, { method: 'GET', signal });
export const post = <T>(path: string, body?: unknown) => api<T>(path, { method: 'POST', body });
export const patch = <T>(path: string, body: unknown) => api<T>(path, { method: 'PATCH', body });
export const put = <T>(path: string, body: unknown) => api<T>(path, { method: 'PUT', body });
export const del = <T>(path: string) => api<T>(path, { method: 'DELETE' });
export const upload = <T>(path: string, formData: FormData) => api<T>(path, { method: 'POST', formData });

export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  pages: number;
}

export interface Paged<T> extends Pagination {
  items: T[];
}

export function qs(params: { [key: string]: string | number | boolean | undefined | null } | undefined): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  }
  const s = search.toString();
  return s ? `?${s}` : '';
}