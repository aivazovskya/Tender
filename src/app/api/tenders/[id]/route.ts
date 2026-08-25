import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { INITIAL_TENDERS } from '@/lib/mockData';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const tenderId = params.id;

  if (!tenderId) {
    return NextResponse.json(
      { success: false, error: 'Параметр ID тендера обязателен' },
      { status: 400 }
    );
  }

  try {
    let tender: any = null;

    try {
      tender = await prisma.tender.findFirst({
        where: {
          OR: [
            { id: tenderId },
            { externalId: tenderId }
          ]
        },
        include: {
          documents: true,
          riskFlags: true,
          history: { orderBy: { timestamp: 'desc' } },
          requirements: { orderBy: { createdAt: 'asc' } }
        }
      });
    } catch (dbErr: any) {
      console.warn('[API /api/tenders/[id] GET] DB unavailable:', dbErr?.message);
    }

    if (!tender) {
      // Fallback lookup in INITIAL_TENDERS
      tender = INITIAL_TENDERS.find(t => t.id === tenderId || t.externalId === tenderId);
    }

    if (!tender) {
      return NextResponse.json(
        { success: false, error: 'Тендер с указанным ID не найден' },
        { status: 404 }
      );
    }

    // Format dates to ISO strings if needed
    const formattedTender = {
      ...tender,
      publishDate: tender.publishDate ? new Date(tender.publishDate).toISOString() : new Date().toISOString(),
      deadlineDate: tender.deadlineDate ? new Date(tender.deadlineDate).toISOString() : new Date().toISOString(),
      documents: tender.documents || [],
      riskFlags: tender.riskFlags || [],
      history: tender.history || []
    };

    return NextResponse.json({
      success: true,
      data: formattedTender
    });
  } catch (error: any) {
    console.error('[API /api/tenders/[id] GET Error]:', error?.message);
    return NextResponse.json(
      { success: false, error: error?.message || 'Ошибка загрузки данных тендера' },
      { status: 500 }
    );
  }
}
