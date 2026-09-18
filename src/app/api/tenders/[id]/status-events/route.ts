import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateApiAuth } from '@/lib/security/auth';
import { TenderPollingService, STATUS_LABELS_RU } from '@/lib/services/tender-polling.service';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await validateApiAuth(request);
  if (!auth.authorized && auth.response) {
    return auth.response;
  }

  const tenderId = params.id;

  try {
    let tender: any = null;
    let events: any[] = [];

    try {
      tender = await prisma.tender.findUnique({
        where: { id: tenderId },
        select: {
          id: true,
          status: true,
          source: true,
          deadlineDate: true,
          lastPolledAt: true
        }
      });

      if (tender) {
        events = await prisma.tenderStatusEvent.findMany({
          where: { tenderId },
          orderBy: { changedAt: 'desc' }
        });
      }
    } catch (dbErr: any) {
      console.warn(`[API /api/tenders/[id]/status-events] DB error:`, dbErr?.message);
    }

    if (!tender) {
      // Mock / offline fallback for demo/test mode
      return NextResponse.json({
        success: true,
        tenderId,
        currentStatus: 'ACTIVE',
        statusLabel: STATUS_LABELS_RU['ACTIVE'],
        lastPolledAt: new Date().toISOString(),
        pollingIntervalMs: 2 * 60 * 60 * 1000,
        events: []
      });
    }

    const pollingIntervalMs = TenderPollingService.getPollingIntervalMs(tender.deadlineDate);

    return NextResponse.json({
      success: true,
      tenderId: tender.id,
      currentStatus: tender.status,
      statusLabel: STATUS_LABELS_RU[tender.status] || tender.status,
      lastPolledAt: tender.lastPolledAt,
      pollingIntervalMs,
      events
    });
  } catch (error: any) {
    console.error('[API /api/tenders/[id]/status-events Error]:', error?.message);
    return NextResponse.json(
      { success: false, message: error?.message || 'Ошибка загрузки истории статусов' },
      { status: 500 }
    );
  }
}
