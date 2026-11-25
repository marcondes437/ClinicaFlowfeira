import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { pool, type LocalUser } from './database';
const scrypt = promisify(scryptCallback);
export const SESSION_COOKIE = 'clinicaflow_local_session';
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
export async function passwordHash(password: string) {
  const salt = randomBytes(16).toString('hex');
  return salt + ':' + ((await scrypt(password, salt, 64)) as Buffer).toString('hex');
}
export async function passwordMatches(password: string, hash: string) {
  const [salt, expected] = hash.split(':');
  if (!salt || !expected) return false;
  const actual = await scrypt(password, salt, 64) as Buffer;
  const stored = Buffer.from(expected, 'hex');
  return stored.length === actual.length && timingSafeEqual(stored, actual);
}
export async function sessionUser(token?: string): Promise<LocalUser | null> {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const { rows } = await pool().query('select u.id,u.email from auth.local_sessions s join auth.users u on u.id=s.user_id where s.token_hash=$1 and s.expires_at>now()', [tokenHash(token)]);
  return rows[0] ?? null;
}
export async function createSession(userId: string) {
  const token = randomBytes(32).toString('hex');
  await pool().query('delete from auth.local_sessions where expires_at <= now()');
  await pool().query('insert into auth.local_sessions(token_hash,user_id) values($1,$2)', [tokenHash(token), userId]);
  return token;
}
