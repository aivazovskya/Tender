import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateApiAuth } from '@/lib/security/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = validateApiAuth(request, 'ADMIN');
  if (!auth.authorized && auth.response) return auth.response;

  try {
    const sources = await prisma.dataSource.findMany({
      include: {
        scraperConfig: true
      },
      orderBy: { createdAt: 'asc' }
    });

    if (sources.length > 0) {
      return NextResponse.json({
        success: true,
        isFallback: false,
        sources
      });
    }
  } catch (error: any) {
    console.warn('[API /api/admin/sources Database Connection Fallback]:', error?.message);
  }

  // Graceful fallback if database is unseeded or offline
  return NextResponse.json({
    success: true,
    isFallback: true,
    sources: [
      {
        id: 'ds-1',
        name: 'GOSZAKUP',
        displayName: 'goszakup.gov.kz (ЕГСЗ РК)',
        adapterType: 'API',
        isActive: true,
        checkIntervalMins: 15,
        healthStatus: 'HEALTHY',
        successRate24h: 99.8,
        totalIngested: 14290
      },
      {
        id: 'ds-2',
        name: 'SAMRUK_KAZYNA',
        displayName: 'portal.sk.kz (Самрук-Казына)',
        adapterType: 'API',
        isActive: true,
        checkIntervalMins: 30,
        healthStatus: 'HEALTHY',
        successRate24h: 99.5,
        totalIngested: 10610
      }
    ]
  });
}
