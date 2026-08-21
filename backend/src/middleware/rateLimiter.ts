import { Request, Response, NextFunction } from 'express';
import { redis } from '../config/redis';

/**
 * Creates a fixed-window rate limiter middleware backed by Redis.
 *
 * @param prefix Redis key prefix (e.g., 'rl:login')
 * @param maxRequests Maximum requests allowed in the window
 * @param windowSeconds Window duration in seconds
 */
export function rateLimit(prefix: string, maxRequests: number, windowSeconds: number) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void | Response> => {
    try {
      // Use IP address as the identifier.
      // If behind a proxy, ensure app.set('trust proxy', 1) is configured in express.
      const ip = req.ip || req.connection.remoteAddress || 'unknown';
      const key = `${prefix}:${ip}`;

      // INCR increments the key by 1. If the key does not exist, it's set to 0 before performing the operation.
      const currentRequests = await redis.incr(key);

      // If it's the first request in the window, set the expiration
      if (currentRequests === 1) {
        await redis.expire(key, windowSeconds);
      }

      if (currentRequests > maxRequests) {
        // Calculate remaining TTL to send Retry-After header
        const ttl = await redis.ttl(key);
        res.setHeader('Retry-After', ttl > 0 ? ttl : windowSeconds);

        return res.status(429).json({
          error: {
            code: 'TOO_MANY_REQUESTS',
            message: `Too many requests, please try again in ${ttl > 0 ? ttl : windowSeconds} seconds.`,
          },
        });
      }

      // Add standard rate limit headers (optional but good practice)
      res.setHeader('X-RateLimit-Limit', maxRequests);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - currentRequests));

      next();
    } catch (err) {
      // If Redis fails, fail open to prevent blocking legitimate traffic, but log the error
      console.error('[RateLimiter] Error:', err);
      next();
    }
  };
}
