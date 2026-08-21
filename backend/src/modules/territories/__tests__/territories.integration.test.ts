import request from 'supertest';
import { createApp } from '../../../app';
import { pool } from '../../../config/db';
import { encodeGeohash } from '../geohash';

const app = createApp();

describe('Territories API Integration', () => {
  let token: string;
  let userId: string;

  beforeAll(async () => {
    const res = await request(app).post('/api/auth/register').send({
      username: 'terrtester',
      email: 'user@terrs.test.com',
      password: 'password123',
    });

    token = res.body.accessToken;
    userId = res.body.user.id;
  });

  describe('GET /api/territories', () => {
    let testGeohash: string;

    beforeAll(async () => {
      // Insert a mock territory for this user
      const lat = 40.7128; // NYC
      const lng = -74.006;
      testGeohash = encodeGeohash(lat, lng);

      await pool.query(
        `INSERT INTO territories (geohash, owner_id, center_lat, center_lng)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (geohash) DO UPDATE SET owner_id = $2`,
        [testGeohash, userId, lat, lng]
      );
    });

    it('returns 401 if not authenticated', async () => {
      await request(app).get('/api/territories?bbox=0,0,1,1').expect(401);
    });

    it('fails validation on missing or invalid bbox', async () => {
      await request(app)
        .get('/api/territories')
        .set('Authorization', `Bearer ${token}`)
        .expect(400); // missing bbox

      await request(app)
        .get('/api/territories?bbox=1,2,3')
        .set('Authorization', `Bearer ${token}`)
        .expect(400); // only 3 coords
    });

    it('returns an empty array for a bounding box with no territories', async () => {
      const res = await request(app)
        .get('/api/territories?bbox=0,0,1,1') // Far away from NYC
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(Array.isArray(res.body.territories)).toBe(true);
      expect(res.body.territories.length).toBe(0);
    });

    it('returns the territory when the bounding box encompasses it', async () => {
      // BBox around NYC
      const minLat = 40.7;
      const minLng = -74.1;
      const maxLat = 40.8;
      const maxLng = -73.9;

      const res = await request(app)
        .get(`/api/territories?bbox=${minLat},${minLng},${maxLat},${maxLng}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(Array.isArray(res.body.territories)).toBe(true);

      const territory = res.body.territories.find((t: any) => t.geohash === testGeohash);
      expect(territory).toBeDefined();
      expect(territory.owner_username).toBe('terrtester');
      expect(territory.owner_id).toBe(userId);
    });
  });

  describe('GET /api/territories/:geohash', () => {
    it('returns 404 for a territory that does not exist', async () => {
      const fakeHash = 'zzzzzzz';
      await request(app)
        .get(`/api/territories/${fakeHash}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });

    it('returns the territory when it exists', async () => {
      const testGeohash = encodeGeohash(40.7128, -74.006);
      const res = await request(app)
        .get(`/api/territories/${testGeohash}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.territory).toBeDefined();
      expect(res.body.territory.geohash).toBe(testGeohash);
      expect(res.body.territory.owner_username).toBe('terrtester');
    });
  });
});
