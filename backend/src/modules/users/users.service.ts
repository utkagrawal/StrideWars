import { pool } from '../../config/db';
import { User } from '../auth/auth.service';

export async function getUserById(id: string): Promise<User | null> {
  const { rows } = await pool.query(
    `SELECT id, username, email, display_name, created_at FROM users WHERE id = $1`,
    [id]
  );
  return (rows[0] as User) || null;
}

export async function getPublicUserById(
  id: string
): Promise<Omit<User, 'email' | 'password_hash'> | null> {
  const { rows } = await pool.query(
    `SELECT id, username, display_name, created_at FROM users WHERE id = $1`,
    [id]
  );
  return (rows[0] as Omit<User, 'email' | 'password_hash'>) || null;
}

export async function updateDisplayName(id: string, displayName: string): Promise<User | null> {
  const { rows } = await pool.query(
    `UPDATE users SET display_name = $1 WHERE id = $2 RETURNING id, username, email, display_name, created_at`,
    [displayName, id]
  );
  return (rows[0] as User) || null;
}
