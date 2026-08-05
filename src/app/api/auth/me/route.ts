import { NextRequest, NextResponse } from 'next/server';
import { validateApiAuth } from '@/lib/security/auth';
import { findUserById } from '@/lib/security/auth-store';

export async function GET(request: NextRequest) {
  try {
    const auth = await validateApiAuth(request);
    if (!auth.authorized && auth.response) {
      return auth.response;
    }

    if (!auth.userId || auth.userId === 'demo-user-id') {
      return NextResponse.json({
        success: true,
        user: {
          id: 'demo-user-id',
          email: 'demo@tender.ai',
          name: 'Демо Пользователь',
          role: 'USER'
        }
      });
    }

    const user = await findUserById(auth.userId);

    if (!user) {
      return NextResponse.json({
        success: true,
        user: {
          id: auth.userId,
          email: `${auth.userId}@tender.ai`,
          name: 'Авторизованный Пользователь',
          role: auth.role
        }
      });
    }

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: user.createdAt
      }
    });
  } catch (error: any) {
    console.error('[API /api/auth/me Error]:', error?.message);
    return NextResponse.json(
      { success: false, message: error?.message || 'Ошибка получения профиля' },
      { status: 500 }
    );
  }
}
