import type { ErrorCode } from '@campushub/shared';

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  validation_failed: 422,
  rate_limited: 429,
  internal_error: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.details = details;
  }
}

export const badRequest = (m: string, d?: unknown) => new AppError('bad_request', m, d);
export const unauthorized = (m = 'Autentificare necesară') => new AppError('unauthorized', m);
export const forbidden = (m = 'Acces interzis') => new AppError('forbidden', m);
export const notFound = (m = 'Resursa nu există') => new AppError('not_found', m);
export const conflict = (m: string, d?: unknown) => new AppError('conflict', m, d);
