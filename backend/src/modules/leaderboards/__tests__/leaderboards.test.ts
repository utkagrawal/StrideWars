import { updateScores } from '../leaderboards.service';
import { redis } from '../../../config/redis';

jest.mock('../../../config/redis', () => ({
  redis: {
    pipeline: jest.fn(),
    del: jest.fn(),
  },
}));

describe('Leaderboards Service (Unit)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('updates scores for a new territory capture (no previous owner)', async () => {
    const pipelineMock = {
      zincrby: jest.fn(),
      exec: jest.fn().mockResolvedValue(true),
    };
    (redis.pipeline as jest.Mock).mockReturnValue(pipelineMock);

    await updateScores([
      { geohash: '9q8yyk8', previousOwnerId: null, newOwnerId: 'user1' }
    ]);

    // Should only increment the new owner
    expect(pipelineMock.zincrby).toHaveBeenCalledWith('leaderboard:global', 1, 'user1');
    expect(pipelineMock.zincrby).toHaveBeenCalledWith('leaderboard:region:9q8', 1, 'user1');
    
    // Should NOT decrement anything
    expect(pipelineMock.zincrby).not.toHaveBeenCalledWith('leaderboard:global', -1, null);
    
    expect(pipelineMock.exec).toHaveBeenCalled();
    expect(redis.del).toHaveBeenCalledWith('leaderboard:cache:global');
  });

  it('updates scores for a stolen territory (has previous owner)', async () => {
    const pipelineMock = {
      zincrby: jest.fn(),
      exec: jest.fn().mockResolvedValue(true),
    };
    (redis.pipeline as jest.Mock).mockReturnValue(pipelineMock);

    await updateScores([
      { geohash: '9q8yyk8', previousOwnerId: 'user1', newOwnerId: 'user2' }
    ]);

    // Should decrement user1
    expect(pipelineMock.zincrby).toHaveBeenCalledWith('leaderboard:global', -1, 'user1');
    expect(pipelineMock.zincrby).toHaveBeenCalledWith('leaderboard:region:9q8', -1, 'user1');
    
    // Should increment user2
    expect(pipelineMock.zincrby).toHaveBeenCalledWith('leaderboard:global', 1, 'user2');
    expect(pipelineMock.zincrby).toHaveBeenCalledWith('leaderboard:region:9q8', 1, 'user2');
    
    expect(pipelineMock.exec).toHaveBeenCalled();
  });
  
  it('does not increment or decrement if recaptured by the same owner', async () => {
    const pipelineMock = {
      zincrby: jest.fn(),
      exec: jest.fn().mockResolvedValue(true),
    };
    (redis.pipeline as jest.Mock).mockReturnValue(pipelineMock);

    await updateScores([
      { geohash: '9q8yyk8', previousOwnerId: 'user1', newOwnerId: 'user1' }
    ]);

    // Should do absolutely nothing in Redis because score hasn't changed
    expect(pipelineMock.zincrby).not.toHaveBeenCalled();
    expect(pipelineMock.exec).toHaveBeenCalled();
  });
});
