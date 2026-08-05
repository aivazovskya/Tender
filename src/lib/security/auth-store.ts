import { prisma } from '../prisma';

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

// In-memory fallback stores for test/offline environments
const memoryUsers = new Map<string, UserRecord>();
const memorySessions = new Map<string, SessionRecord>();
const memoryFailedAttempts = new Map<string, { count: number; lastAttempt: number }>();

let isDbAvailable = true;

export async function findUserByEmail(email: string): Promise<UserRecord | null> {
  if (isDbAvailable) {
    try {
      const user = await prisma.user.findUnique({ where: { email } });
      if (user) return user;
    } catch (err: any) {
      isDbAvailable = false;
    }
  }
  const user = Array.from(memoryUsers.values()).find(u => u.email === email);
  return user || null;
}

export async function findUserById(id: string): Promise<UserRecord | null> {
  if (isDbAvailable) {
    try {
      const user = await prisma.user.findUnique({ where: { id } });
      if (user) return user;
    } catch (err: any) {
      isDbAvailable = false;
    }
  }
  const user = Array.from(memoryUsers.values()).find(u => u.id === id);
  return user || null;
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

  if (isDbAvailable) {
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
      isDbAvailable = false;
    }
  }

  memoryUsers.set(data.email, record);
  return record;
}

export async function createSession(userId: string, userAgent?: string): Promise<SessionRecord> {
  const sessionId = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const record: SessionRecord = { id: sessionId, userId, expiresAt, userAgent: userAgent || null };

  if (isDbAvailable) {
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
      isDbAvailable = false;
    }
  }

  memorySessions.set(sessionId, record);
  return record;
}

export async function getSession(sessionId: string): Promise<{ session: SessionRecord; user: UserRecord } | null> {
  if (isDbAvailable) {
    try {
      const dbSession = await prisma.session.findUnique({
        where: { id: sessionId },
        include: { user: true }
      });
      if (dbSession && dbSession.user) {
        return { session: dbSession, user: dbSession.user };
      }
    } catch (err: any) {
      isDbAvailable = false;
    }
  }

  const memSession = memorySessions.get(sessionId);
  if (!memSession || memSession.expiresAt < new Date()) {
    return null;
  }

  const memUser = Array.from(memoryUsers.values()).find(u => u.id === memSession.userId);
  if (!memUser) return null;

  return { session: memSession, user: memUser };
}

export async function deleteSession(sessionId: string): Promise<boolean> {
  memorySessions.delete(sessionId);
  if (isDbAvailable) {
    try {
      await prisma.session.delete({ where: { id: sessionId } });
    } catch {
      isDbAvailable = false;
    }
  }
  return true;
}

export async function getRecentFailedAttemptsCount(email: string): Promise<number> {
  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
  if (isDbAvailable) {
    try {
      return await prisma.loginAttempt.count({
        where: {
          email,
          success: false,
          createdAt: { gte: fifteenMinutesAgo }
        }
      });
    } catch {
      isDbAvailable = false;
    }
  }

  const entry = memoryFailedAttempts.get(email);
  if (!entry || Date.now() - entry.lastAttempt > 15 * 60 * 1000) {
    return 0;
  }
  return entry.count;
}

export async function recordLoginAttempt(email: string, userId: string | null, success: boolean): Promise<void> {
  if (isDbAvailable) {
    try {
      await prisma.loginAttempt.create({
        data: { email, userId, success }
      });
    } catch {
      isDbAvailable = false;
    }
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
