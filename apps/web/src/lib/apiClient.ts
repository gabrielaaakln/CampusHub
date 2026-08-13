import type { ApiErrorBody, ErrorCode } from '@campushub/shared';

const BASE = '/api/v1';

export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details: unknown;

  constructor(status: number, body: ApiErrorBody['error']) {
    super(body.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.code;
    this.details = body.details;
  }
}

let csrfToken: string | null = null;

async function getCsrfToken(): Promise<string> {
  if (csrfToken) return csrfToken;
  const res = await fetch(`${BASE}/csrf`, { credentials: 'include' });
  const body = (await res.json()) as { data: { token: string } };
  csrfToken = body.data.token;
  return csrfToken;
}

type Options = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
};

export async function api<T>(path: string, options: Options = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const res = await send(path, options, method);

  // a rotated or expired session invalidates the token bound to it one silent retry with a fresh
  // token turns what the user would see as an error into nothing at all
  if (res.status === 403 && method !== 'GET') {
    csrfToken = null;
    const retry = await send(path, options, method);
    return unwrap<T>(retry);
  }

  return unwrap<T>(res);
}

async function send(path: string, options: Options, method: string): Promise<Response> {
  // an upload carries its own content type with the multipart boundary in it
  const form = options.body instanceof FormData;
  const headers: Record<string, string> = {};
  if (options.body !== undefined && !form) headers['content-type'] = 'application/json';
  if (method !== 'GET') headers['x-csrf-token'] = await getCsrfToken();

  return fetch(BASE + path, {
    method,
    headers,
    credentials: 'include',
    signal: options.signal ?? null,
    body:
      options.body === undefined
        ? null
        : options.body instanceof FormData
          ? options.body
          : JSON.stringify(options.body),
  });
}

async function unwrap<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;

  const payload: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 403) csrfToken = null;
    const err = (payload as ApiErrorBody | null)?.error;
    throw new ApiError(res.status, err ?? { code: 'internal_error', message: 'Eroare de rețea' });
  }
  return payload as T;
}

export function forgetCsrfToken(): void {
  csrfToken = null;
}
