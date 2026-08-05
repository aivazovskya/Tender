import { NextRequest, NextResponse } from 'next/server';
import { IngestionHealthService } from '@/lib/services/ingestion-health.service';
import { validateApiAuth } from '@/lib/security/auth';

export async function GET(request: NextRequest) {
  const cronSecretHeader = request.headers.get('x-cron-secret') || request.headers.get('X-Cron-Secret');
  const authHeader = request.headers.get('authorization') || request.headers.get('Authorization');
  let bearerToken = '';
  if (authHeader && authHeader.startsWith('Bearer ')) {
    bearerToken = authHeader.substring(7).trim();
  }

  const token = cronSecretHeader || bearerToken;
  const expectedSecret = process.env.CRON_SECRET || process.env.ADMIN_API_KEY;
  const isProd = process.env.NODE_ENV === 'production';

  if ((expectedSecret || isProd) && token !== expectedSecret) {
    const auth = await validateApiAuth(request, 'ADMIN');
    if (!auth.authorized && auth.response) {
      return auth.response;
    }
  }

  try {
    await IngestionHealthService.checkHeartbeats();
    const summary = await IngestionHealthService.getHealthSummary();

    return NextResponse.json({
      success: true,
      message: 'Проверка активности (heartbeats) источников тендеров успешно выполнена',
      timestamp: new Date().toISOString(),
      summary
    });
  } catch (error: any) {
    console.error('[API /api/cron/health-check Error]:', error?.message);
    return NextResponse.json(
      { success: false, error: error?.message || 'Сбой при проверке активности источников' },
      { status: 500 }
    );
  }
}
