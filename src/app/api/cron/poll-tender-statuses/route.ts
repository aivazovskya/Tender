import { NextRequest, NextResponse } from 'next/server';
import { TenderPollingService } from '@/lib/services/tender-polling.service';

export async function GET(request: NextRequest) {
  return handleCronJob(request);
}

export async function POST(request: NextRequest) {
  return handleCronJob(request);
}

async function handleCronJob(request: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      console.error('[Cron poll-tender-statuses] CRON_SECRET is not configured');
      return NextResponse.json(
        { success: false, message: 'Server misconfiguration' },
        { status: 500 }
      );
    }

    const authHeader = request.headers.get('x-cron-secret') || request.headers.get('X-Cron-Secret');
    const { searchParams } = new URL(request.url);
    const secretQuery = searchParams.get('cronSecret') || searchParams.get('secret');
    const providedSecret = authHeader || secretQuery;

    if (!providedSecret || providedSecret !== cronSecret) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized: Invalid X-Cron-Secret header or query secret' },
        { status: 401 }
      );
    }

    const force = searchParams.get('force') === 'true';
    const specificTenderId = searchParams.get('tenderId');

    if (specificTenderId) {
      const result = await TenderPollingService.pollTender(specificTenderId, { force: true });
      return NextResponse.json({
        success: true,
        singleTender: true,
        result
      });
    }

    const summary = await TenderPollingService.pollActiveKanbanTenders();

    return NextResponse.json({
      success: true,
      summary
    });
  } catch (error: any) {
    console.error('[Cron poll-tender-statuses] Unhandled exception:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
