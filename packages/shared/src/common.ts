import { z } from 'zod';

export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 100;

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_LIMIT).default(DEFAULT_PAGE_LIMIT),
});
export type PaginationQuery = z.infer<typeof paginationQuery>;

export type PaginationMeta = {
  page: number;
  limit: number;
  total: number;
  has_next: boolean;
};

export type Paginated<T> = {
  data: T[];
  meta: PaginationMeta;
};

export type Collection<T> = { data: T[] };

export const ERROR_CODES = [
  'bad_request',
  'unauthorized',
  'forbidden',
  'not_found',
  'conflict',
  'validation_failed',
  'rate_limited',
  'internal_error',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export type ApiErrorBody = {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
};

export const idParam = z.object({ id: z.coerce.number().int().positive() });

// iso 8601 with offset the server never assumes the client timezone
export const isoDateTime = z.iso.datetime({ offset: true });
export const isoDate = z.iso.date();
