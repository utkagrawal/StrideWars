import bcrypt from 'bcrypt';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { pool } from '../../config/db';
import { env } from '../../config/env';

export interface User {
  id: string;
  username: string;
  email: string;
  password_hash: string;
  display_name: string | null;
  token_version: number;
  created_at: Date;
}

// We use bcrypt's built-in salting because it automatically generates a unique
// cryptographically secure salt for each password and embeds it directly into the
// resulting hash string. This eliminates the need to manage and store salts
// manually, reducing the surface area for implementation errors.
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateAccessToken(user: User): string {
  return jwt.sign({ userId: user.id, username: user.username }, env.JWT_SECRET, {
    expiresIn: '15m' as any,
  });
}

export function generateRefreshToken(user: User): string {
  return jwt.sign(
    { userId: user.id, username: user.username, tokenVersion: user.token_version },
    env.JWT_SECRET,
    { expiresIn: (env.JWT_EXPIRES_IN || '7d') as any }
  );
}

export function verifyRefreshToken(token: string): JwtPayload | string {
  return jwt.verify(token, env.JWT_SECRET);
}

export async function createUser(
  username: string,
  email: string,
  passwordHash: string
): Promise<User> {
  const { rows } = await pool.query(
    `INSERT INTO users (username, email, password_hash)
     VALUES ($1, $2, $3)
     RETURNING id, username, email, password_hash, display_name, token_version, created_at`,
    [username, email, passwordHash]
  );
  return rows[0] as User;
}

export async function incrementTokenVersion(userId: string): Promise<void> {
  await pool.query(`UPDATE users SET token_version = token_version + 1 WHERE id = $1`, [userId]);
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const { rows } = await pool.query(`SELECT * FROM users WHERE email = $1`, [email]);
  return (rows[0] as User) || null;
}

export async function getUserById(id: string): Promise<User | null> {
  const { rows } = await pool.query(`SELECT * FROM users WHERE id = $1`, [id]);
  return (rows[0] as User) || null;
}
