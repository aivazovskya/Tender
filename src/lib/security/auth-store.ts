import { prisma } from '../prisma';

export class AuthStoreUnavailableError extends Error {
  constructor(message = 'AUTH_STORE_UNAVAILABLE') {
    super(message);
    this.name = 'AuthStoreUnavailableError';
  }
}

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  name?: string | null;
  role: string;
  createdAt: Date;
}

export interface SessionRecord {
  id: string;
  userId: string;
  expiresAt: Date;
  userAgent?: string | null;
}

// In-memory stores for test/offline environments (activated via AUTH_STORE_MODE === 'memory')
const memoryUsers = new Map<string, UserRecord>();
const memorySessions = new Map<string, SessionRecord>();
const memoryFailedAttempts = new Map<string, { count: number; lastAttempt: number }>();

function isMemoryMode(): boolean {
  return process.env.AUTH_STORE_MODE === 'memory';
}

export async function findUserByEmail(email: string): Promise<UserRecord | null> {
  if (isMemoryMode()) {
    const user = Array.from(memoryUsers.values()).find(u => u.email === email);
    return user || null;
  }
  try {
    return await prisma.user.findUnique({ where: { email } });
  } catch (err: any) {
    console.error('[auth-store] DB unavailable in findUserByEmail:', err?.message);
    throw new AuthStoreUnavailableError('AUTH_STORE_UNAVAILABLE');
  }
}

export async function findUserById(id: string): Promise<UserRecord | null> {
  if (isMemoryMode()) {
    const user = Array.from(memoryUsers.values()).find(u => u.id === id);
    return user || null;
  }
  try {
    return await prisma.user.findUnique({ where: { id } });
  } catch (err: any) {
    console.error('[auth-store] DB unavailable in findUserById:', err?.message);
    throw new AuthStoreUnavailableError('AUTH_STORE_UNAVAILABLE');
  }
}

export async function createUser(data: { email: string; passwordHash: string; name?: string | null }): Promise<UserRecord> {
  const userId = `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const record: UserRecord = {
    id: userId,
    email: data.email,
    passwordHash: data.passwordHash,
    name: data.name || null,
    role: 'USER',
    createdAt: new Date()
  };

  if (isMemoryMode()) {
    memoryUsers.set(data.email, record);
    return record;
  }

  try {
    const dbUser = await prisma.user.create({
      data: {
        id: userId,
        email: data.email,
        passwordHash: data.passwordHash,
        name: data.name || null,
        role: 'USER'
      }
    });
    memoryUsers.set(data.email, dbUser);
    return dbUser;
  } catch (err: any) {
    console.error('[auth-store] DB unavailable in createUser:', err?.message);
    throw new AuthStoreUnavailableError('AUTH_STORE_UNAVAILABLE');
  }
}

export async function createSession(userId: string, userAgent?: string): Promise<SessionRecord> {
  const sessionId = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const record: SessionRecord = { id: sessionId, userId, expiresAt, userAgent: userAgent || null };

  if (isMemoryMode()) {
    memorySessions.set(sessionId, record);
    return record;
  }

  try {
    const dbSession = await prisma.session.create({
      data: {
        id: sessionId,
        userId,
        expiresAt,
        userAgent
      }
    });
    memorySessions.set(sessionId, dbSession);
    return dbSession;
  } catch (err: any) {
    console.error('[auth-store] DB unavailable in createSession:', err?.message);
    throw new AuthStoreUnavailableError('AUTH_STORE_UNAVAILABLE');
  }
}

export async function getSession(sessionId: string): Promise<{ session: SessionRecord; user: UserRecord } | null> {
  if (isMemoryMode()) {
    const memSession = memorySessions.get(sessionId);
    if (!memSession || memSession.expiresAt < new Date()) {
      return null;
    }
    const memUser = Array.from(memoryUsers.values()).find(u => u.id === memSession.userId);
    if (!memUser) return null;
    return { session: memSession, user: memUser };
  }

  try {
    const dbSession = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { user: true }
    });
    if (dbSession && dbSession.user) {
      return { session: dbSession, user: dbSession.user };
    }
    return null;
  } catch (err: any) {
    console.error('[auth-store] DB unavailable in getSession:', err?.message);
    throw new AuthStoreUnavailableError('AUTH_STORE_UNAVAILABLE');
  }
}

export async function deleteSession(sessionId: string): Promise<boolean> {
  memorySessions.delete(sessionId);
  if (isMemoryMode()) {
    return true;
  }
  try {
    await prisma.session.delete({ where: { id: sessionId } });
  } catch (err: any) {
    console.error('[auth-store] DB unavailable in deleteSession:', err?.message);
    throw new AuthStoreUnavailableError('AUTH_STORE_UNAVAILABLE');
  }
  return true;
}

export async function getRecentFailedAttemptsCount(email: string): Promise<number> {
  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
  if (isMemoryMode()) {
    const entry = memoryFailedAttempts.get(email);
    if (!entry || Date.now() - entry.lastAttempt > 15 * 60 * 1000) {
      return 0;
    }
    return entry.count;
  }

  try {
    return await prisma.loginAttempt.count({
      where: {
        email,
        success: false,
        createdAt: { gte: fifteenMinutesAgo }
      }
    });
  } catch (err: any) {
    console.error('[auth-store] DB unavailable in getRecentFailedAttemptsCount:', err?.message);
    throw new AuthStoreUnavailableError('AUTH_STORE_UNAVAILABLE');
  }
}

/**
 * ASYMMETRY DESIGN DECISION:
 * If DB logging for a login attempt fails, we log the error via console.error,
 * but DO NOT throw AuthStoreUnavailableError so that an already-authenticated user
 * with valid credentials is not blocked from signing in due to an audit metric logging failure.
 */
export async function recordLoginAttempt(email: string, userId: string | null, success: boolean): Promise<void> {
  if (isMemoryMode()) {
    if (!success) {
      const entry = memoryFailedAttempts.get(email) || { count: 0, lastAttempt: Date.now() };
      if (Date.now() - entry.lastAttempt > 15 * 60 * 1000) {
        entry.count = 1;
      } else {
        entry.count += 1;
      }
      entry.lastAttempt = Date.now();
      memoryFailedAttempts.set(email, entry);
    } else {
      memoryFailedAttempts.delete(email);
    }
    return;
  }

  try {
    await prisma.loginAttempt.create({
      data: { email, userId, success }
    });
  } catch (err: any) {
    console.error('[auth-store] Non-blocking DB error recording login attempt:', err?.message);
  }

  if (!success) {
    const entry = memoryFailedAttempts.get(email) || { count: 0, lastAttempt: Date.now() };
    if (Date.now() - entry.lastAttempt > 15 * 60 * 1000) {
      entry.count = 1;
    } else {
      entry.count += 1;
    }
    entry.lastAttempt = Date.now();
    memoryFailedAttempts.set(email, entry);
  } else {
    memoryFailedAttempts.delete(email);
  }
}
