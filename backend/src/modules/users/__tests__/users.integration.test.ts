import request from 'supertest';
import { createApp } from '../../../app';
import { pool } from '../../../config/db';

const app = createApp();

describe('Users Integration', () => {
  let token: string;
  let userId: string;

  beforeAll(async () => {
    await pool.query('DELETE FROM users WHERE email LIKE $1', ['%@test.com']);
    const res = await request(app).post('/api/auth/register').send({
      username: 'userstest',
      email: 'users@test.com',
      password: 'password123',
    });
    token = res.body.accessToken;
    userId = res.body.user.id;
  });

  afterAll(async () => {
    await pool.end();
  });

  describe('GET /api/users/me', () => {
    it('returns the current user profile', async () => {
      const res = await request(app)
        .get('/api/users/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.user.username).toBe('userstest');
      expect(res.body.user.email).toBe('users@test.com');
    });

    it('returns 401 without auth token', async () => {
      await request(app).get('/api/users/me').expect(401);
    });
  });

  describe('PATCH /api/users/me', () => {
    it('updates display name', async () => {
      const res = await request(app)
        .patch('/api/users/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ displayName: 'New Name' })
        .expect(200);

      expect(res.body.user.displayName).toBe('New Name');
    });
  });

  describe('GET /api/users/:id', () => {
    it('returns public profile for a user', async () => {
      const res = await request(app).get(`/api/users/${userId}`).expect(200);
      expect(res.body.user.username).toBe('userstest');
      expect(res.body.user.email).toBeUndefined(); // Email is hidden on public profile
    });
  });
});
