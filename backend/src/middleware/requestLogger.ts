import morgan from 'morgan';
import { env } from '../config/env';

/**
 * HTTP request logger middleware backed by morgan.
 *
 * - Development: `dev` format (colorized, concise)
 * - Production:  `combined` format (Apache-style, structured)
 *
 * TODO (Phase 2): Route morgan output into a structured logger (e.g., pino)
 *                 and ship logs to an aggregation service.
 */
export const requestLogger = morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev');
