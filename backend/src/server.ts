import { createApp } from './app';
import { env } from './config/env';

const app = createApp();

const server = app.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`🏃 StrideWars backend running on http://localhost:${env.PORT}`);
  // eslint-disable-next-line no-console
  console.log(`   Environment : ${env.NODE_ENV}`);
  // eslint-disable-next-line no-console
  console.log(`   Health check: http://localhost:${env.PORT}/api/health`);
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

export default server;
