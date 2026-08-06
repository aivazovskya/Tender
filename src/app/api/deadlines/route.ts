import { NextRequest, NextResponse } from 'next/server';
import { validateApiAuth } from '@/lib/security/auth';
import { resolveOwnCompanyProfile } from '@/lib/security/resolve-company-profile';
import { DeadlineService, DeadlineStatus, DeadlineType, CriticalityZone } from '@/lib/services/deadline.service';

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

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') as DeadlineStatus | undefined;
    const type = searchParams.get('type') as DeadlineType | undefined;
    const criticalityZone = searchParams.get('criticalityZone') as CriticalityZone | undefined;

    const deadlines = await DeadlineService.getCompanyDeadlines(companyProfile.id, {
      status,
      type,
      criticalityZone
    });

    return NextResponse.json({
      success: true,
      count: deadlines.length,
      deadlines
    });
  } catch (error: any) {
    console.error('[API /api/deadlines GET Error]:', error?.message);
    return NextResponse.json(
      { success: false, message: error?.message || 'Ошибка получения списка дедлайнов' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const { tenderId, type, dueAt, title } = body || {};

    if (!tenderId || typeof tenderId !== 'string') {
      return NextResponse.json(
        { success: false, message: 'Укажите идентификатор тендера (tenderId)' },
        { status: 400 }
      );
    }

    if (!dueAt || isNaN(Date.parse(dueAt))) {
      return NextResponse.json(
        { success: false, message: 'Укажите корректную дату и время дедлайна (dueAt)' },
        { status: 400 }
      );
    }

    const deadlineType: DeadlineType = type || 'CUSTOM';

    const newDeadline = await DeadlineService.createDeadline({
      tenderId,
      companyId: companyProfile.id,
      type: deadlineType,
      dueAt: new Date(dueAt),
      title: title ? String(title).trim() : null,
      createdBy: auth.userId
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Дедлайн успешно создан',
        deadline: newDeadline
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('[API /api/deadlines POST Error]:', error?.message);
    return NextResponse.json(
      { success: false, message: error?.message || 'Ошибка создания дедлайна' },
      { status: 500 }
    );
  }
}
