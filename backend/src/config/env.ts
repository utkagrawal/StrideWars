import dotenv from 'dotenv';
import path from 'path';

// Load .env from backend root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  PORT: parseInt(process.env.PORT ?? '3001', 10),

  // Database (Phase 2)
  DATABASE_URL: process.env.DATABASE_URL ?? '',
  DB_HOST: process.env.DB_HOST ?? 'localhost',
  DB_PORT: parseInt(process.env.DB_PORT ?? '5432', 10),
  DB_NAME: process.env.DB_NAME ?? 'stridewars',
  DB_USER: process.env.DB_USER ?? 'postgres',
  DB_PASSWORD: process.env.DB_PASSWORD ?? '',

  // Redis (Phase 2)
  REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379',

  // Auth (Phase 3)
  JWT_SECRET: process.env.JWT_SECRET ?? 'change-me-in-production',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN ?? '7d',
} as const;
