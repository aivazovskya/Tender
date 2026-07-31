import { NextRequest, NextResponse } from 'next/server';
import { CompetitionService } from '@/lib/services/competition.service';

export async function POST(request: NextRequest) {
  try {
    // Cron security check: X-Cron-Secret or Authorization header match
    const cronSecret = request.headers.get('x-cron-secret') || request.headers.get('X-Cron-Secret');
    const authHeader = request.headers.get('authorization') || request.headers.get('Authorization');
    
    const expectedSecret = process.env.CRON_SECRET || process.env.ADMIN_API_KEY || 'tenderai-cron-secret-2026';
    const isProd = process.env.NODE_ENV === 'production';

    const isAuthorized = cronSecret === expectedSecret || 
      (authHeader && authHeader.endsWith(expectedSecret)) || 
      (!isProd && !cronSecret);

    if (!isAuthorized) {
      return NextResponse.json(
        { success: false, error: 'UNAUTHORIZED', message: 'Недействительный заголовок X-Cron-Secret' },
        { status: 401 }
      );
    }

    const result = await CompetitionService.recomputeStats();

    return NextResponse.json({
      success: true,
      message: `Статистика конкуренции успешно пересчитана!`,
      data: result
    });
  } catch (err: any) {
    console.error('[API /api/notifications/recompute-stats] Ошибка:', err);
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: err?.message || 'Сбой пересчёта статистики' },
      { status: 500 }
    );
  }
}
