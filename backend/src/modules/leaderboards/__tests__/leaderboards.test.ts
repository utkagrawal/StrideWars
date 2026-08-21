import { updateScores } from '../leaderboards.service';
import { redis } from '../../../config/redis';
import { pool } from '../../../config/db';

jest.mock('../../../config/redis', () => ({
  redis: {
    pipeline: jest.fn(),
    del: jest.fn(),
  },
}));

jest.mock('../../../config/db', () => ({
  pool: {
    query: jest.fn(),
  },
}));

describe('Leaderboards Service (Unit)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('updates scores using true area calculation via ZADD', async () => {
    const pipelineMock = {
      zadd: jest.fn(),
      zrem: jest.fn(),
      exec: jest.fn().mockResolvedValue(true),
    };
    (redis.pipeline as jest.Mock).mockReturnValue(pipelineMock);
    
    // Mock user territories
    // Two adjacent cells for user1: '9q8yyk8' and '9q8yyk9'
    (pool.query as jest.Mock).mockResolvedValue({
      rows: [
        { geohash: '9q8yyk8' },
        { geohash: '9q8yyk9' }
      ]
    });

    await updateScores([
      { geohash: '9q8yyk8', previousOwnerId: null, newOwnerId: 'user1' }
    ]);

    // Should call pool.query once for the user
    expect(pool.query).toHaveBeenCalledWith(expect.any(String), ['user1']);
    
    // Should use ZADD
    expect(pipelineMock.zadd).toHaveBeenCalledWith('leaderboard:region:9q8', expect.any(Number), 'user1');
    expect(pipelineMock.zadd).toHaveBeenCalledWith('leaderboard:global', expect.any(Number), 'user1');
    
    expect(pipelineMock.exec).toHaveBeenCalled();
  });

  it('removes a user completely when they lose all territories in a region', async () => {
    const pipelineMock = {
      zadd: jest.fn(),
      zrem: jest.fn(),
      exec: jest.fn().mockResolvedValue(true),
    };
    (redis.pipeline as jest.Mock).mockReturnValue(pipelineMock);

    // Mock empty territories for user1 (they lost everything)
    // Mock territories for user2 (the new owner)
    (pool.query as jest.Mock).mockImplementation((_query, params) => {
      if (params[0] === 'user1') return Promise.resolve({ rows: [] });
      if (params[0] === 'user2') return Promise.resolve({ rows: [{ geohash: '9q8yyk8' }] });
      return Promise.resolve({ rows: [] });
    });

    await updateScores([
      { geohash: '9q8yyk8', previousOwnerId: 'user1', newOwnerId: 'user2' }
    ]);

    // user1 should be ZREMed from region and global
    expect(pipelineMock.zrem).toHaveBeenCalledWith('leaderboard:region:9q8', 'user1');
    expect(pipelineMock.zrem).toHaveBeenCalledWith('leaderboard:global', 'user1');
    
    // user2 should be ZADDed
    expect(pipelineMock.zadd).toHaveBeenCalledWith('leaderboard:region:9q8', expect.any(Number), 'user2');
    expect(pipelineMock.zadd).toHaveBeenCalledWith('leaderboard:global', expect.any(Number), 'user2');

    expect(pipelineMock.exec).toHaveBeenCalled();
  });
});
