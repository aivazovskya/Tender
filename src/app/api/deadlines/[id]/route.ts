import { NextRequest, NextResponse } from 'next/server';
import { validateApiAuth } from '@/lib/security/auth';
import { resolveOwnCompanyProfile } from '@/lib/security/resolve-company-profile';
import { DeadlineService, DeadlineStatus } from '@/lib/services/deadline.service';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    const deadlineId = params?.id;
    if (!deadlineId) {
      return NextResponse.json(
        { success: false, message: 'Не указан ID дедлайна' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { status, dueAt, title } = body || {};

    const validStatuses: DeadlineStatus[] = ['PENDING', 'COMPLETED', 'MISSED', 'CANCELLED'];
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json(
        { success: false, message: `Недопустимый статус. Разрешены: ${validStatuses.join(', ')}` },
        { status: 400 }
      );
    }

    let parsedDueAt: Date | undefined;
    if (dueAt) {
      if (isNaN(Date.parse(dueAt))) {
        return NextResponse.json(
          { success: false, message: 'Укажите корректную дату dueAt' },
          { status: 400 }
        );
      }
      parsedDueAt = new Date(dueAt);
    }

    const updated = await DeadlineService.updateDeadline(deadlineId, companyProfile.id, {
      status,
      dueAt: parsedDueAt,
      title: title !== undefined ? (title ? String(title).trim() : null) : undefined
    });

    if (!updated) {
      return NextResponse.json(
        { success: false, message: 'Дедлайн не найден или не принадлежит вашей компании' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Дедлайн успешно обновлен',
      deadline: updated
    });
  } catch (error: any) {
    console.error('[API /api/deadlines/[id] PATCH Error]:', error?.message);
    return NextResponse.json(
      { success: false, message: error?.message || 'Ошибка обновления дедлайна' },
      { status: 500 }
    );
  }
}
