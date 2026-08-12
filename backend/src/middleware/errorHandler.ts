import { Request, Response, NextFunction } from 'express';

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
}

/**
 * Centralized error handler middleware.
 * Must be registered LAST in the Express middleware chain.
 *
 * Responds with a consistent JSON error shape:
 *   { error: string; code?: string }
 */
export function errorHandler(
  err: AppError,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  const statusCode = err.statusCode ?? 500;
  const message = err.message || 'Internal Server Error';
  const code = err.code ?? 'INTERNAL_ERROR';

  // TODO: Replace with a proper logger (e.g., pino) in Phase 2
  if (statusCode >= 500) {
    // eslint-disable-next-line no-console
    console.error('[ErrorHandler]', err);
  }

  res.status(statusCode).json({ error: message, code });
}
