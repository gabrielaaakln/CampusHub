import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import type { ApiErrorBody } from '@campushub/shared';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

export const notFoundHandler: RequestHandler = (_req, res) => {
  const body: ApiErrorBody = {
    error: { code: 'not_found', message: 'Ruta nu există' },
  };
  res.status(404).json(body);
};

/** single place that turns anything thrown into the documented error shape */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (res.headersSent) return;

  if (err instanceof ZodError) {
    return send(res, 422, {
      error: {
        code: 'validation_failed',
        message: 'Date invalide',
        details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    });
  }

  if (err instanceof AppError) {
    return send(res, err.status, {
      error: { code: err.code, message: err.message, details: err.details },
    });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      return send(res, 409, { error: { code: 'conflict', message: 'Înregistrare duplicată' } });
    }
    if (err.code === 'P2025') {
      return send(res, 404, { error: { code: 'not_found', message: 'Resursa nu există' } });
    }
  }

  if (isCsrfError(err)) {
    return send(res, 403, { error: { code: 'forbidden', message: 'Token CSRF invalid' } });
  }

  logger.error({ err, url: req.originalUrl, method: req.method }, 'unhandled error');
  send(res, 500, { error: { code: 'internal_error', message: 'Eroare internă' } });
};

function send(res: Parameters<ErrorRequestHandler>[2], status: number, body: ApiErrorBody): void {
  res.status(status).json(body);
}

function isCsrfError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === 'EBADCSRFTOKEN'
  );
}
