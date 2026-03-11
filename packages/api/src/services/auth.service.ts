import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { getDb } from '@twmail/shared';
import { getConfig } from '../config.js';
import { AppError } from '../plugins/error-handler.js';
import { ErrorCode } from '@twmail/shared';
import type { JwtPayload } from '../plugins/auth.js';

const BCRYPT_ROUNDS = 12;

export async function login(email: string, password: string) {
  const db = getDb();
  const config = getConfig();

  const user = await db
    .selectFrom('users')
    .selectAll()
    .where('email', '=', email)
    .executeTakeFirst();

  if (!user) {
    throw new AppError(401, ErrorCode.UNAUTHORIZED, 'Invalid email or password');
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    throw new AppError(401, ErrorCode.UNAUTHORIZED, 'Invalid email or password');
  }

  // Update last_login_at
  await db
    .updateTable('users')
    .set({ last_login_at: new Date() })
    .where('id', '=', user.id)
    .execute();

  const accessToken = generateToken(user, 'access', config.JWT_EXPIRES_IN);
  const refreshToken = generateToken(user, 'refresh', config.JWT_REFRESH_EXPIRES_IN);

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
  };
}

export async function refreshToken(token: string) {
  const config = getConfig();
  const db = getDb();

  let payload: JwtPayload;
  try {
    payload = jwt.verify(token, config.JWT_SECRET) as JwtPayload;
  } catch {
    throw new AppError(401, ErrorCode.UNAUTHORIZED, 'Invalid or expired refresh token');
  }

  if (payload.type !== 'refresh') {
    throw new AppError(401, ErrorCode.UNAUTHORIZED, 'Invalid token type');
  }

  const user = await db
    .selectFrom('users')
    .selectAll()
    .where('id', '=', payload.sub)
    .executeTakeFirst();

  if (!user) {
    throw new AppError(401, ErrorCode.UNAUTHORIZED, 'User not found');
  }

  const accessToken = generateToken(user, 'access', config.JWT_EXPIRES_IN);
  const newRefreshToken = generateToken(user, 'refresh', config.JWT_REFRESH_EXPIRES_IN);

  return {
    access_token: accessToken,
    refresh_token: newRefreshToken,
  };
}

export async function getMe(userId: number) {
  const db = getDb();

  const user = await db
    .selectFrom('users')
    .select(['id', 'email', 'name', 'role', 'last_login_at', 'created_at'])
    .where('id', '=', userId)
    .executeTakeFirst();

  if (!user) {
    throw new AppError(404, ErrorCode.NOT_FOUND, 'User not found');
  }

  return user;
}

function generateToken(
  user: { id: number; email: string; role: number },
  type: 'access' | 'refresh',
  expiresIn: string,
): string {
  const config = getConfig();
  const payload: JwtPayload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    type,
  };
  return jwt.sign(payload, config.JWT_SECRET, { expiresIn });
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}
