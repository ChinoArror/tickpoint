import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { ZodError, type ZodType, type z } from 'zod'

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'SESSION_EXPIRED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'CIRCULAR_DEPENDENCY'
  | 'CIRCULAR_HIERARCHY'
  | 'NESTING_TOO_DEEP'
  | 'RATE_LIMITED'
  | 'QUOTA_EXCEEDED'
  | 'QUOTA_CHECK_FAILED'
  | 'AI_FORBIDDEN'
  | 'EMAIL_NOT_VERIFIED'
  | 'VERIFICATION_FAILED'
  | 'PAYLOAD_TOO_LARGE'
  | 'CSRF_REJECTED'
  | 'AI_DISABLED'
  | 'AI_UNAVAILABLE'
  | 'AI_INVALID_OUTPUT'
  | 'AI_TIMEOUT'
  | 'AUTH_UNAVAILABLE'
  | 'AUTH_REJECTED'
  | 'INVALID_GRANT'
  | 'NOT_CONFIGURED'
  | 'EDITED_CHECKPOINTS'
  | 'INTERNAL_ERROR'

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly status: ContentfulStatusCode,
    message?: string,
    public readonly details?: unknown,
  ) {
    super(message ?? code)
  }
}

export const notFound = (what = 'Resource') => new AppError('NOT_FOUND', 404, `${what} not found`)
export const forbidden = (msg = 'Forbidden') => new AppError('FORBIDDEN', 403, msg)
export const conflict = (msg: string) => new AppError('CONFLICT', 409, msg)

export function ok<T>(c: Context, data: T, status: ContentfulStatusCode = 200) {
  return c.json({ success: true, data, error: null }, status)
}

export function fail(c: Context, err: AppError) {
  return c.json(
    {
      success: false,
      data: null,
      error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) },
    },
    err.status,
  )
}

export function zodToAppError(e: ZodError): AppError {
  return new AppError(
    'VALIDATION_ERROR',
    400,
    'Request validation failed',
    e.issues.slice(0, 20).map((i) => ({ path: i.path.join('.'), message: i.message })),
  )
}

export function parse<S extends ZodType>(schema: S, input: unknown): z.infer<S> {
  const r = schema.safeParse(input)
  if (!r.success) throw zodToAppError(r.error)
  return r.data
}

export async function readJson<S extends ZodType>(c: Context, schema: S): Promise<z.infer<S>> {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    throw new AppError('VALIDATION_ERROR', 400, 'Body must be valid JSON')
  }
  return parse(schema, body)
}

export function readQuery<S extends ZodType>(c: Context, schema: S): z.infer<S> {
  return parse(schema, c.req.query())
}
