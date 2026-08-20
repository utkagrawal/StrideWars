import { createApp } from './app';
import { env } from './config/env';
import { connectDb } from './config/db';
import { connectRedis } from './config/redis';

async function bootstrap(): Promise<void> {
  // Attempt connections — warn if unavailable, do NOT crash.
  // The /api/health endpoint will surface any failure per-request.
  await Promise.all([connectDb(), connectRedis()]);

  const app = createApp();

  const server = app.listen(env.PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`\n🏃 StrideWars backend running on http://localhost:${env.PORT}`);
    // eslint-disable-next-line no-console
    console.log(`   Environment : ${env.NODE_ENV}`);
    // eslint-disable-next-line no-console
    console.log(`   Health check: http://localhost:${env.PORT}/api/health\n`);
  });

  // Graceful shutdown
  const shutdown = (): void => {
    // eslint-disable-next-line no-console
    console.log('\nShutting down gracefully...');
    server.close(() => {
      // eslint-disable-next-line no-console
      console.log('Server closed.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

bootstrap().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  // eslint-disable-next-line no-console
  console.error('Fatal startup error:', message);
  process.exit(1);
});
