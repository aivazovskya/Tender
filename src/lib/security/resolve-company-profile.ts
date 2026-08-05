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
    return await prisma.companyProfile.findFirst({
      where: { userId }
    });
  } catch (err) {
    return null;
  }
}
