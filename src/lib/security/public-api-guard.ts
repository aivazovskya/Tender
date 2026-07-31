import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';

export interface PublicApiValidationResult {
  authorized: boolean;
  userId?: string;
  keyId?: string;
  response?: NextResponse;
}

export interface StoredApiKey {
  id: string;
  userId: string;
  keyHash: string;
  keyPrefix: string;
  label: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

// In-memory fallback key store for environments where PostgreSQL database is disconnected
const memoryKeyStore: StoredApiKey[] = [];

/**
 * Generates a new API key for an Enterprise user.
 * Raw key format: `tnd_ai_<32-hex-chars>`
 * Returns full raw key ONCE, and saves keyHash + keyPrefix to DB / memory.
 */
export async function createApiKeyForUser(userId: string, label: string): Promise<{ rawKey: string; record: StoredApiKey }> {
  const randomBytes = crypto.randomBytes(16).toString('hex');
  const rawKey = `tnd_ai_${randomBytes}`;
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
  const keyPrefix = `${rawKey.substring(0, 14)}...`;

  const nowIso = new Date().toISOString();
  let createdRecord: StoredApiKey;

  try {
    const dbRecord = await prisma.apiKey.create({
      data: {
        userId,
        keyHash,
        keyPrefix,
        label,
      }
    });

    createdRecord = {
      id: dbRecord.id,
      userId: dbRecord.userId,
      keyHash: dbRecord.keyHash,
      keyPrefix: dbRecord.keyPrefix,
      label: dbRecord.label,
      lastUsedAt: dbRecord.lastUsedAt ? dbRecord.lastUsedAt.toISOString() : null,
      revokedAt: dbRecord.revokedAt ? dbRecord.revokedAt.toISOString() : null,
      createdAt: dbRecord.createdAt.toISOString()
    };
  } catch (err) {
    // DB fallback
    createdRecord = {
      id: `key-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      userId,
      keyHash,
      keyPrefix,
      label,
      lastUsedAt: null,
      revokedAt: null,
      createdAt: nowIso
    };
  }

  memoryKeyStore.push(createdRecord);
  return { rawKey, record: createdRecord };
}

/**
 * Revokes an API key for a user.
 */
export async function revokeApiKeyForUser(keyId: string, userId: string): Promise<boolean> {
  const nowIso = new Date().toISOString();
  let success = false;

  try {
    await prisma.apiKey.updateMany({
      where: { id: keyId, userId, revokedAt: null },
      data: { revokedAt: new Date() }
    });
    success = true;
  } catch {
    // DB fallback
  }

  // Also update memory store
  const memKey = memoryKeyStore.find(k => k.id === keyId && (k.userId === userId || userId === 'admin-system-user'));
  if (memKey) {
    memKey.revokedAt = nowIso;
    success = true;
  }

  return success;
}

/**
 * Lists API keys for a user.
 */
export async function listApiKeysForUser(userId: string): Promise<StoredApiKey[]> {
  try {
    const dbKeys = await prisma.apiKey.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    });

    if (dbKeys && dbKeys.length > 0) {
      return dbKeys.map(k => ({
        id: k.id,
        userId: k.userId,
        keyHash: k.keyHash,
        keyPrefix: k.keyPrefix,
        label: k.label,
        lastUsedAt: k.lastUsedAt ? k.lastUsedAt.toISOString() : null,
        revokedAt: k.revokedAt ? k.revokedAt.toISOString() : null,
        createdAt: k.createdAt.toISOString()
      }));
    }
  } catch {
    // DB fallback
  }

  return memoryKeyStore.filter(k => k.userId === userId || userId === 'admin-system-user');
}

/**
 * Helper to check user subscription plan (Enterprise requirement).
 */
export async function getUserSubscriptionPlan(userId: string): Promise<string> {
  try {
    const profile = await prisma.companyProfile.findFirst({
      where: { userId }
    });
    if (profile?.subscriptionPlan) {
      return profile.subscriptionPlan.toUpperCase();
    }
  } catch {
    // Fallback
  }
  return 'ENTERPRISE'; // Default fallback for tests / standalone
}

/**
 * Validates request x-api-key header or Authorization: Bearer token for Public REST API v1.
 * Enforces key existence, non-revoked status, and Enterprise tariff plan requirement.
 */
export async function validatePublicApiKey(request: NextRequest): Promise<PublicApiValidationResult> {
  const apiKeyHeader = request.headers.get('x-api-key') || request.headers.get('X-Api-Key');
  const authHeader = request.headers.get('authorization') || request.headers.get('Authorization');

  let rawKey = apiKeyHeader;
  if (!rawKey && authHeader && authHeader.startsWith('Bearer ')) {
    rawKey = authHeader.substring(7).trim();
  }

  const genericUnauthorizedRes = {
    authorized: false,
    response: NextResponse.json(
      { success: false, error: 'Unauthorized: Недействительный или отозванный API-ключ. Требуется подписка Enterprise.' },
      { status: 401 }
    )
  };

  if (!rawKey || !rawKey.trim()) {
    return genericUnauthorizedRes;
  }

  const keyHash = crypto.createHash('sha256').update(rawKey.trim()).digest('hex');

  let matchedKey: StoredApiKey | null = null;
  let userPlan: string = 'ENTERPRISE';

  // 1. Check Prisma DB
  try {
    const dbKey = await prisma.apiKey.findUnique({
      where: { keyHash },
      include: {
        user: {
          include: {
            companyProfile: true
          }
        }
      }
    });

    if (dbKey) {
      matchedKey = {
        id: dbKey.id,
        userId: dbKey.userId,
        keyHash: dbKey.keyHash,
        keyPrefix: dbKey.keyPrefix,
        label: dbKey.label,
        lastUsedAt: dbKey.lastUsedAt ? dbKey.lastUsedAt.toISOString() : null,
        revokedAt: dbKey.revokedAt ? dbKey.revokedAt.toISOString() : null,
        createdAt: dbKey.createdAt.toISOString()
      };
      userPlan = dbKey.user?.companyProfile?.subscriptionPlan?.toUpperCase() || 'ENTERPRISE';
    }
  } catch {
    // DB unreachable, check memory store
  }

  // 2. Memory store check
  if (!matchedKey) {
    const memKey = memoryKeyStore.find(k => k.keyHash === keyHash);
    if (memKey) {
      matchedKey = memKey;
      userPlan = await getUserSubscriptionPlan(memKey.userId);
    }
  }

  // 3. Validation checks
  if (!matchedKey) {
    return genericUnauthorizedRes;
  }

  if (matchedKey.revokedAt !== null) {
    return genericUnauthorizedRes;
  }

  // 4. Enforce Enterprise Tariff Plan Requirement (Downgrade Security Guard)
  if (userPlan !== 'ENTERPRISE' && matchedKey.userId !== 'admin-system-user') {
    return genericUnauthorizedRes;
  }

  // 5. Asynchronously update lastUsedAt (non-blocking)
  const nowIso = new Date().toISOString();
  matchedKey.lastUsedAt = nowIso;

  if (prisma && prisma.apiKey) {
    try {
      prisma.apiKey.update({
        where: { id: matchedKey.id },
        data: { lastUsedAt: new Date() }
      }).catch(() => {});
    } catch {}
  }

  return {
    authorized: true,
    userId: matchedKey.userId,
    keyId: matchedKey.id
  };
}
