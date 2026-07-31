import { NextRequest, NextResponse } from 'next/server';
import { ReputationService, ReputationEntityType } from '@/lib/services/reputation.service';
import { validateReputationAccess } from '@/lib/security/subscription-guard';

// Simple in-memory rate limiter per user/session (30 checks / hour)
const userRequestCounts = new Map<string, { count: number; resetAt: number }>();
const MAX_CHECKS_PER_HOUR = 30;

function enforceUserRateLimit(identifier: string): boolean {
  const now = Date.now();
  const entry = userRequestCounts.get(identifier);

  if (!entry || now > entry.resetAt) {
    userRequestCounts.set(identifier, { count: 1, resetAt: now + 60 * 60 * 1000 });
    return true;
  }

  if (entry.count >= MAX_CHECKS_PER_HOUR) {
    return false;
  }

  entry.count += 1;
  return true;
}

export async function GET(request: NextRequest) {
  try {
    // 1. Subscription Guard Access Control (PRO, TEAM, ENTERPRISE required)
    const access = await validateReputationAccess(request);
    if (!access.authorized && access.response) {
      return access.response;
    }

    const userId = access.userId || 'anonymous-user';

    // 2. User Rate Limiting (30 checks / hour)
    if (!enforceUserRateLimit(userId)) {
      return NextResponse.json(
        {
          success: false,
          error: 'RATE_LIMIT_EXCEEDED',
          message: 'Превышен лимит проверок контрагентов (максимум 30 проверок в час). Попробуйте позже.'
        },
        { status: 429 }
      );
    }

    // 3. Extract query parameters
    const { searchParams } = new URL(request.url);
    const bin = searchParams.get('bin');
    const typeParam = (searchParams.get('type') || 'SUPPLIER').toUpperCase();

    if (!bin) {
      return NextResponse.json(
        { success: false, error: 'INVALID_BIN', message: 'Укажите параметр bin в URL (например ?bin=180940004512)' },
        { status: 400 }
      );
    }

    if (!ReputationService.isValidBin(bin)) {
      return NextResponse.json(
        { success: false, error: 'INVALID_BIN_FORMAT', message: 'Некорректный формат БИН/ИИН. Значение должно состоять ровно из 12 цифр.' },
        { status: 400 }
      );
    }

    const entityType: ReputationEntityType = typeParam === 'CUSTOMER' ? 'CUSTOMER' : 'SUPPLIER';

    // 4. Perform Reputation Check
    const result = await ReputationService.checkBin(bin, entityType);

    return NextResponse.json({
      success: true,
      data: result
    });
  } catch (err: any) {
    console.error('[API /api/reputation/check] Ошибка:', err);
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: err?.message || 'Ошибка обработки запроса' },
      { status: 500 }
    );
  }
}
