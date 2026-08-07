import { NextRequest, NextResponse } from 'next/server';
import { CashFlowService } from '@/lib/services/cash-flow.service';
import { validateApiAuth } from '@/lib/security/auth';
import { resolveOwnCompanyProfile } from '@/lib/security/resolve-company-profile';

export async function GET(request: NextRequest) {
  try {
    const auth = await validateApiAuth(request);
    if (!auth.authorized && auth.response) {
      return auth.response;
    }

    const companyProfile = await resolveOwnCompanyProfile(auth.userId);
    if (!companyProfile) {
      return NextResponse.json(
        { success: false, message: 'Профиль компании не найден. Сначала заполните профиль компании.' },
        { status: 404 }
      );
    }

    const timelineData = await CashFlowService.getCashFlowTimeline(companyProfile.id);

    return NextResponse.json({
      success: true,
      data: timelineData
    });
  } catch (error: any) {
    console.error('[API /api/finance/cash-flow-timeline Error]:', error?.message || error);
    return NextResponse.json(
      { success: false, message: error?.message || 'Ошибка загрузки прогноза освобождения средств' },
      { status: 500 }
    );
  }
}
