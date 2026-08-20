import request from 'supertest';
import { createApp } from '../../../app';
import { pool } from '../../../config/db';

const app = createApp();

describe('Auth Integration', () => {
  beforeAll(async () => {
    await pool.query('DELETE FROM users WHERE email LIKE $1', ['%@test.com']);
  });

  afterAll(async () => {
    await pool.end();
  });

  const testUser = {
    username: 'testauthuser',
    email: 'auth@test.com',
    password: 'password123',
  };

  describe('POST /api/auth/register', () => {
    it('successfully registers a new user', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send(testUser)
        .expect(201);

      expect(res.body.user).toBeDefined();
      expect(res.body.user.username).toBe(testUser.username);
      expect(res.body.accessToken).toBeDefined();
      expect(res.headers['set-cookie'][0]).toContain('refreshToken=');
    });

    it('returns 409 Conflict if email is already taken', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ ...testUser, username: 'anotheruser' })
        .expect(409);

      expect(res.body.error.code).toBe('CONFLICT');
    });

    it('returns 400 Bad Request if validation fails', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ username: 'sh', email: 'not-an-email', password: 'short' })
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /api/auth/login', () => {
    it('successfully logs in and issues tokens', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: testUser.email, password: testUser.password })
        .expect(200);

      expect(res.body.user).toBeDefined();
      expect(res.body.accessToken).toBeDefined();
      expect(res.headers['set-cookie'][0]).toContain('refreshToken=');
    });

    it('returns 401 Unauthorized for incorrect password', async () => {
      await request(app)
        .post('/api/auth/login')
        .send({ email: testUser.email, password: 'wrongpassword' })
        .expect(401);
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('successfully refreshes token with valid cookie', async () => {
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: testUser.email, password: testUser.password });

      const cookie = loginRes.headers['set-cookie'];

      const res = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', cookie)
        .expect(200);

      expect(res.body.accessToken).toBeDefined();
    });

    it('returns 401 without refresh cookie', async () => {
      await request(app).post('/api/auth/refresh').expect(401);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('clears the refresh cookie', async () => {
      const res = await request(app).post('/api/auth/logout').expect(200);
      expect(res.headers['set-cookie'][0]).toContain('refreshToken=;');
    });
  });
});
