import request from 'supertest';
import { createApp } from '../app';

describe('GET /api/health', () => {
  const app = createApp();

  it('responds with 200 and { status: "ok" }', async () => {
    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('responds with Content-Type application/json', async () => {
    const response = await request(app).get('/api/health');

    expect(response.headers['content-type']).toMatch(/application\/json/);
  });
});
