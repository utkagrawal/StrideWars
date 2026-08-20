/**
 * Unit tests for GET /api/health
 *
 * These tests run WITHOUT Docker infrastructure (Postgres/Redis may be down).
 * They verify the HTTP contract and shape of the response, not the actual
 * database/redis connectivity (that is covered by health.integration.test.ts).
 *
 * The health endpoint gracefully handles infra failures — it always returns
 * a valid JSON body and never crashes the server.
 */
import request from 'supertest';
import { createApp } from '../app';

// ── Mock db and redis checks so unit tests don't need real infrastructure ──
jest.mock('../config/db', () => ({
  pool: {},
  connectDb: jest.fn().mockResolvedValue(undefined),
  checkDb: jest.fn().mockResolvedValue('ok'),
}));

jest.mock('../config/redis', () => ({
  redis: { on: jest.fn() },
  connectRedis: jest.fn().mockResolvedValue(undefined),
  checkRedis: jest.fn().mockResolvedValue('ok'),
}));

describe('GET /api/health (unit — mocked infra)', () => {
  const app = createApp();

  it('returns 200 with status ok when both checks pass', async () => {
    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok', db: 'ok', redis: 'ok' });
  });

  it('returns Content-Type application/json', async () => {
    const response = await request(app).get('/api/health');

    expect(response.headers['content-type']).toMatch(/application\/json/);
  });

  it('returns 503 with status degraded when db check fails', async () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const dbMock: { checkDb: jest.Mock } = jest.requireMock('../config/db');
    dbMock.checkDb.mockResolvedValueOnce('error');

    const response = await request(app).get('/api/health');

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({ status: 'degraded', db: 'error', redis: 'ok' });
  });

  it('returns 503 with status degraded when redis check fails', async () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const redisMock: { checkRedis: jest.Mock } = jest.requireMock('../config/redis');
    redisMock.checkRedis.mockResolvedValueOnce('error');

    const response = await request(app).get('/api/health');

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({ status: 'degraded', db: 'ok', redis: 'error' });
  });
});
