import { NextRequest, NextResponse } from 'next/server';
import { validateApiAuth } from '@/lib/security/auth';
import { findPendingUsers } from '@/lib/security/auth-store';

export async function GET(request: NextRequest) {
  try {
    const auth = await validateApiAuth(request, 'ADMIN');
    if (!auth.authorized && auth.response) {
      return auth.response;
    }

    const pendingUsers = await findPendingUsers();

    return NextResponse.json({
      success: true,
      users: pendingUsers.map(u => ({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        status: u.status,
        createdAt: u.createdAt
      }))
    });
  } catch (error: any) {
    if (error?.message === 'AUTH_STORE_UNAVAILABLE' || error?.name === 'AuthStoreUnavailableError') {
      return NextResponse.json(
        { success: false, message: 'Сервис авторизации временно недоступен' },
        { status: 503 }
      );
    }
    console.error('[API /api/admin/users/pending Error]:', error?.message);
    return NextResponse.json(
      { success: false, message: error?.message || 'Ошибка загрузки заявок пользователей' },
      { status: 500 }
    );
  }
}
