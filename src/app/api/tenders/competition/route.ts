import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { CompetitionService } from '@/lib/services/competition.service';
import { validateApiAuth } from '@/lib/security/auth';
import { INITIAL_TENDERS } from '@/lib/mockData';

export async function GET(request: NextRequest) {
  try {
    const auth = await validateApiAuth(request, 'USER');
    const { searchParams } = new URL(request.url);
    const tenderId = searchParams.get('tenderId');

    if (!tenderId) {
      return NextResponse.json(
        { success: false, error: 'MISSING_TENDER_ID', message: 'Укажите параметр tenderId в URL' },
        { status: 400 }
      );
    }

    // 1. Fetch Tender from DB or MockData fallback
    let tender: any = null;
    try {
      tender = await prisma.tender.findFirst({
        where: { OR: [{ id: tenderId }, { externalId: tenderId }] },
        include: { riskFlags: true }
      });
    } catch {}

    if (!tender) {
      tender = INITIAL_TENDERS.find(t => t.id === tenderId || t.externalId === tenderId);
    }

    if (!tender) {
      return NextResponse.json(
        { success: false, error: 'NOT_FOUND', message: 'Лот с указанным ID не найден' },
        { status: 404 }
      );
    }

    // 2. Fetch User's CompanyProfile if authenticated
    let companyProfile: any = null;
    if (auth.authorized && auth.userId) {
      try {
        const user = await prisma.user.findUnique({
          where: { id: auth.userId },
          include: { companyProfile: true }
        });
        companyProfile = user?.companyProfile || null;
      } catch {}
    }

    // 3. Compute Competition Estimate
    const estimate = await CompetitionService.estimate(tender, companyProfile, auth.userId);

    return NextResponse.json({
      success: true,
      data: estimate
    });
  } catch (err: any) {
    console.error('[API /api/tenders/competition] Ошибка:', err);
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: err?.message || 'Ошибка вычисления конкуренции' },
      { status: 500 }
    );
  }
}
