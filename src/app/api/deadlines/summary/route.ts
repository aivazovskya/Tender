import { NextRequest, NextResponse } from 'next/server';
import { validateApiAuth } from '@/lib/security/auth';
import { resolveOwnCompanyProfile } from '@/lib/security/resolve-company-profile';
import { DeadlineService } from '@/lib/services/deadline.service';

export async function GET(request: NextRequest) {
  try {
    const auth = await validateApiAuth(request);
    if (!auth.authorized && auth.response) {
      return auth.response;
    }

    const companyProfile = await resolveOwnCompanyProfile(auth.userId);
    if (!companyProfile) {
      return NextResponse.json(
        { success: false, message: 'Профиль компании не найден' },
        { status: 404 }
      );
    }

    const summary = await DeadlineService.getDeadlinesSummary(companyProfile.id);

    return NextResponse.json({
      success: true,
      summary
    });
  } catch (error: any) {
    console.error('[API /api/deadlines/summary GET Error]:', error?.message);
    return NextResponse.json(
      { success: false, message: error?.message || 'Ошибка получения сводки дедлайнов' },
      { status: 500 }
    );
  }
}
