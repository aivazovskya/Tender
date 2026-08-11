import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateApiAuth } from '@/lib/security/auth';
import { PriceBenchmarkService } from '@/lib/services/price-benchmark.service';
import { INITIAL_TENDERS } from '@/lib/mockData';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await validateApiAuth(request, 'USER');
  if (!auth.authorized) {
    return auth.response || NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const tenderId = params.id;

  try {
    let tender: any = null;
    try {
      tender = await prisma.tender.findUnique({
        where: { id: tenderId },
        select: { id: true, externalId: true, category: true, region: true, amount: true }
      });
    } catch {}

    if (!tender) {
      tender = INITIAL_TENDERS.find(t => t.id === tenderId || t.externalId === tenderId);
    }

    if (!tender) {
      return NextResponse.json({ success: false, message: 'Тендер не найден' }, { status: 404 });
    }

    const benchmark = await PriceBenchmarkService.getBenchmarkForCategory(
      tender.category,
      tender.region,
      6
    );

    return NextResponse.json({
      success: true,
      tenderAmount: tender.amount,
      benchmark
    });
  } catch (error: any) {
    console.error('[API /api/tenders/[id]/price-benchmark Error]:', error?.message);
    return NextResponse.json(
      { success: false, message: error?.message || 'Ошибка генерации бенчмарка цен' },
      { status: 500 }
    );
  }
}
