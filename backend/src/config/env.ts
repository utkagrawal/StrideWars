import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

// Load .env from the backend directory root (one level above src/)
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// ── Environment schema ──────────────────────────────────────────────────────
// Required vars fail fast with a descriptive error at startup.
// Optional vars fall back to safe development defaults.

const envSchema = z.object({
  // Server
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),

  // Database — required; no safe default possible
  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL is required. Copy backend/.env.example → backend/.env and set it.'),

  // Redis — required; no safe default possible
  REDIS_URL: z
    .string()
    .min(1, 'REDIS_URL is required. Copy backend/.env.example → backend/.env and set it.'),

  // Auth (Phase 3)
  JWT_SECRET: z.string().default('change-me-in-production'),
  JWT_EXPIRES_IN: z.string().default('7d'),

  // CORS
  CORS_ORIGIN: z.string().default('http://localhost:5173,http://localhost:5174'),
});

// ── Fail fast ───────────────────────────────────────────────────────────────
const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  • ${i.path.join('.')}: ${i.message}`).join('\n');
  // Use process.stderr directly — logger may not be initialised yet
  process.stderr.write(
    `\n❌ Invalid environment configuration:\n${issues}\n\nCheck backend/.env.example for required variables.\n\n`
  );
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
