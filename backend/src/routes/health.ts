import { Router, Request, Response } from 'express';
import { checkDb } from '../config/db';
import { checkRedis } from '../config/redis';

export const healthRouter = Router();

/**
 * GET /api/health
 *
 * Probes both PostgreSQL and Redis and reports their status.
 * Returns HTTP 200 only when both checks pass.
 * Returns HTTP 503 when either dependency is unreachable.
 *
 * Response shape:
 *   { status: "ok" | "degraded", db: "ok" | "error", redis: "ok" | "error" }
 *
 * This is the canonical "is my local environment working?" endpoint used
 * at the start of every dev session from Phase 1.5 onwards.
 */
healthRouter.get('/', (_req: Request, res: Response): void => {
  void (async (): Promise<void> => {
    const [db, redisStatus] = await Promise.all([checkDb(), checkRedis()]);

    const allOk = db === 'ok' && redisStatus === 'ok';

    res.status(allOk ? 200 : 503).json({
      status: allOk ? 'ok' : 'degraded',
      db,
      redis: redisStatus,
    });
  })();
});
