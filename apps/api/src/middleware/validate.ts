import type { RequestHandler, Request } from 'express';
import type { ZodType } from 'zod';

export type RouteSchemas = {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
};

export type Validated<S extends RouteSchemas> = {
  body: S['body'] extends ZodType<infer B> ? B : undefined;
  query: S['query'] extends ZodType<infer Q> ? Q : undefined;
  params: S['params'] extends ZodType<infer P> ? P : undefined;
};

// express 5 exposes req query as a getter so parsed data goes to req valid instead
export function validate(schemas: RouteSchemas): RequestHandler {
  return (req, _res, next) => {
    const valid: Record<string, unknown> = {};
    if (schemas.body) valid.body = schemas.body.parse(req.body);
    if (schemas.query) valid.query = schemas.query.parse(req.query);
    if (schemas.params) valid.params = schemas.params.parse(req.params);
    req.valid = valid;
    next();
  };
}

export function valid<S extends RouteSchemas>(req: Request): Validated<S> {
  return req.valid as Validated<S>;
}
