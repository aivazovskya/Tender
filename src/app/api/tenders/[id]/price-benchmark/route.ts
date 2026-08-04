import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PriceBenchmarkService } from '@/lib/services/price-benchmark.service';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const tenderId = params.id;

  try {
    const tender = await prisma.tender.findUnique({
      where: { id: tenderId },
      select: { category: true, region: true, amount: true }
    });

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
