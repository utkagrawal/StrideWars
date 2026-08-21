import { hashPassword, comparePassword, generateAccessToken, generateRefreshToken, verifyRefreshToken, User } from '../auth.service';
import jwt from 'jsonwebtoken';

jest.mock('jsonwebtoken', () => ({
  sign: jest.fn(),
  verify: jest.fn(),
}));

describe('Auth Service', () => {
  const mockUser: User = {
    id: 'user-123',
    username: 'testuser',
    email: 'test@example.com',
    password_hash: 'hashed_password',
    display_name: 'Test User',
    created_at: new Date(),
    token_version: 1,
  };

  describe('Password Hashing', () => {
    it('hashes passwords securely', async () => {
      const password = 'mysecretpassword';
      const hash = await hashPassword(password);
      expect(hash).not.toBe(password);
      expect(hash).toMatch(/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/);
    });

    it('successfully compares correct passwords', async () => {
      const password = 'mysecretpassword';
      const hash = await hashPassword(password);
      const isValid = await comparePassword(password, hash);
      expect(isValid).toBe(true);
    });

    it('rejects incorrect passwords', async () => {
      const hash = await hashPassword('correct');
      const isValid = await comparePassword('wrong', hash);
      expect(isValid).toBe(false);
    });
  });

  describe('JWT Tokens', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('generates an access token with a 15m expiration', () => {
      (jwt.sign as jest.Mock).mockReturnValue('mockAccessToken');
      const token = generateAccessToken(mockUser);
      expect(token).toBe('mockAccessToken');
      expect(jwt.sign).toHaveBeenCalledWith(
        { userId: mockUser.id, username: mockUser.username },
        expect.any(String),
        { expiresIn: '15m' }
      );
    });

    it('generates a refresh token with env expiration', () => {
      (jwt.sign as jest.Mock).mockReturnValue('mockRefreshToken');
      const token = generateRefreshToken(mockUser);
      expect(token).toBe('mockRefreshToken');
      expect(jwt.sign).toHaveBeenCalledWith(
        { userId: mockUser.id, username: mockUser.username, tokenVersion: mockUser.token_version },
        expect.any(String),
        { expiresIn: expect.any(String) }
      );
    });

    it('verifies a refresh token', () => {
      (jwt.verify as jest.Mock).mockReturnValue({ userId: 'test-uuid' });
      const decoded = verifyRefreshToken('valid-token');
      expect(decoded).toEqual({ userId: 'test-uuid' });
      expect(jwt.verify).toHaveBeenCalledWith('valid-token', expect.any(String));
    });
  });
});
