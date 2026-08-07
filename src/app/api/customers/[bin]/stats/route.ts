import { NextRequest, NextResponse } from 'next/server';
import { CustomerAnalyticsService } from '@/lib/services/customer-analytics.service';
import { ReputationService } from '@/lib/services/reputation.service';
import { validateApiAuth } from '@/lib/security/auth';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ bin: string }> | { bin: string } }
) {
  try {
    // 1. Auth Check (Requires authenticated platform user)
    const auth = await validateApiAuth(request, 'USER');
    if (!auth.authorized && auth.response) {
      return auth.response;
    }

    // 2. Resolve params
    const resolvedParams = await context.params;
    const bin = (resolvedParams?.bin || '').trim();

    if (!bin || !ReputationService.isValidBin(bin)) {
      return NextResponse.json(
        {
          success: false,
          error: 'INVALID_BIN_FORMAT',
          message: 'Некорректный формат БИН/ИИН. Значение должно состоять ровно из 12 цифр.'
        },
        { status: 400 }
      );
    }

    // 3. Aggregate 12-month internal statistics + RNU reputation
    const stats = await CustomerAnalyticsService.getInternalCustomerStats(bin);
    const reputation = await CustomerAnalyticsService.getCustomerReputation(bin);

    return NextResponse.json({
      success: true,
      data: {
        customerBin: bin,
        stats,
        reputation
      }
    });
  } catch (err: any) {
    console.error(`[API /api/customers/[bin]/stats Error]:`, err?.message || err);
    return NextResponse.json(
      {
        success: false,
        error: 'INTERNAL_ERROR',
        message: err?.message || 'Ошибка вычисления статистики заказчика'
      },
      { status: 500 }
    );
  }
}
