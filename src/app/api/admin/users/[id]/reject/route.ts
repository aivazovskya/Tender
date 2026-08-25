import { NextRequest, NextResponse } from 'next/server';
import { validateApiAuth } from '@/lib/security/auth';
import { updateUserStatus } from '@/lib/security/auth-store';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await validateApiAuth(request, 'ADMIN');
    if (!auth.authorized && auth.response) {
      return auth.response;
    }

    const userId = params.id;
    if (!userId) {
      return NextResponse.json(
        { success: false, message: 'ID пользователя обязателен' },
        { status: 400 }
      );
    }

    const updatedUser = await updateUserStatus(userId, 'REJECTED');

    if (!updatedUser) {
      return NextResponse.json(
        { success: false, message: 'Пользователь не найден' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Заявка пользователя ${updatedUser.email} отклонена`,
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        status: updatedUser.status
      }
    });
  } catch (error: any) {
    if (error?.message === 'AUTH_STORE_UNAVAILABLE' || error?.name === 'AuthStoreUnavailableError') {
      return NextResponse.json(
        { success: false, message: 'Сервис авторизации временно недоступен' },
        { status: 503 }
      );
    }
    console.error('[API /api/admin/users/[id]/reject Error]:', error?.message);
    return NextResponse.json(
      { success: false, message: error?.message || 'Ошибка отклонения пользователя' },
      { status: 500 }
    );
  }
}
