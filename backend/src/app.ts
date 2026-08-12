import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { requestLogger } from './middleware/requestLogger';
import { errorHandler } from './middleware/errorHandler';

// Module routers (placeholders — implemented in subsequent phases)
import { authRouter } from './modules/auth/routes';
import { usersRouter } from './modules/users/routes';
import { runsRouter } from './modules/runs/routes';
import { territoriesRouter } from './modules/territories/routes';
import { leaderboardsRouter } from './modules/leaderboards/routes';
import { socialRouter } from './modules/social/routes';
import { notificationsRouter } from './modules/notifications/routes';

export function createApp(): Application {
  const app = express();

  // ── Security & parsing middleware ──────────────────────────────────────────
  app.use(helmet());
  app.use(
    cors({
      origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
      credentials: true,
    })
  );
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(requestLogger);

  // ── Health check ───────────────────────────────────────────────────────────
  app.get('/api/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok' });
  });

  // ── Domain module routes ───────────────────────────────────────────────────
  app.use('/api/auth', authRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/runs', runsRouter);
  app.use('/api/territories', territoriesRouter);
  app.use('/api/leaderboards', leaderboardsRouter);
  app.use('/api/social', socialRouter);
  app.use('/api/notifications', notificationsRouter);

  // ── 404 fallthrough ────────────────────────────────────────────────────────
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'Not Found', code: 'NOT_FOUND' });
  });

  // ── Centralized error handler (must be last) ───────────────────────────────
  app.use(errorHandler);

  return app;
}
