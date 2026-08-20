import { Request, Response, NextFunction } from 'express';

interface CustomError extends Error {
  code?: string;
  statusCode?: number;
}

export const errorHandler = (
  err: CustomError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void | Response => {
  // eslint-disable-next-line no-console
  console.error('[Error]', err);

  // Handle Postgres unique constraint violation
  if (err.code === '23505') {
    return res.status(409).json({
      error: {
        code: 'CONFLICT',
        message: 'A user with that email or username already exists.',
      },
    });
  }

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  return res.status(statusCode).json({
    error: {
      code: err.code || 'INTERNAL_ERROR',
      message,
    },
  });
};
