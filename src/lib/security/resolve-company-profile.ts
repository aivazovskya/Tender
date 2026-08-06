import { prisma } from '@/lib/prisma';
import { CompanyProfile } from '@prisma/client';

/**
 * Resolves the CompanyProfile belonging to the given userId.
 * Returns null if no company profile exists for this exact user.
 * Explicitly avoids fallback queries without `where: { userId }` to prevent IDOR vulnerabilities.
 */
export async function resolveOwnCompanyProfile(userId: string): Promise<CompanyProfile | null> {
  if (!userId) return null;
  try {
    const profile = await prisma.companyProfile.findFirst({
      where: { userId }
    });
    if (profile) return profile;
  } catch (err) {
    // DB error fallback in memory/demo mode
  }

  // Demo user or offline memory test mode fallback
  if (userId === 'demo-user-id' || process.env.AUTH_STORE_MODE === 'memory') {
    return {
      id: userId === 'demo-user-id' ? 'demo-company-profile-id' : `cp_${userId}`,
      userId,
      organizationId: null,
      companyName: 'Тестовая Компания',
      bin: '123456789012',
      activities: 'Тендерные поставки',
      keywords: [],
      regions: [],
      minAmount: 0,
      maxAmount: null,
      contactEmail: 'demo@tender.ai',
      telegramChatId: null,
      subscriptionPlan: 'FREE',
      subscriptionExpiresAt: null,
      createdAt: new Date(),
      updatedAt: new Date()
    } as any;
  }

  return null;
}
