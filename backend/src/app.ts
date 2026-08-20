import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { requestLogger } from './middleware/requestLogger';
import { errorHandler } from './middleware/errorHandler';
import { healthRouter } from './routes/health';

// Module routers
import authRouter from './modules/auth/auth.routes';
import usersRouter from './modules/users/users.routes';
import runsRouter from './modules/runs/runs.routes';
import { territoriesRouter } from './modules/territories/routes';
import { leaderboardsRouter } from './modules/leaderboards/routes';
import { socialRouter } from './modules/social/routes';
import { notificationsRouter } from './modules/notifications/routes';
import { env } from './config/env';

export function createApp(): Application {
  const app = express();

  // ── Security & parsing middleware ──────────────────────────────────────────
  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGIN.split(','),
      credentials: true,
    })
  );
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(requestLogger);

  // ── Health check (Phase 1.5+: probes Postgres + Redis) ────────────────────
  app.use('/api/health', healthRouter);

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
