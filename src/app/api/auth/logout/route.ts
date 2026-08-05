import { NextRequest, NextResponse } from 'next/server';
import { deleteSession } from '@/lib/security/auth-store';

export async function POST(request: NextRequest) {
  try {
    const sessionCookie = request.cookies?.get('tender_session_id')?.value;
    const sessionHeader = request.headers.get('x-session-id') || request.headers.get('X-Session-Id');
    const sessionId = sessionCookie || sessionHeader;

    if (sessionId) {
      await deleteSession(sessionId);
    }

    const response = NextResponse.json({
      success: true,
      message: 'Успешный выход из системы'
    });

    response.cookies.set('tender_session_id', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 0
    });

    return response;
  } catch (error: any) {
    console.error('[API /api/auth/logout Error]:', error?.message);
    return NextResponse.json(
      { success: false, message: error?.message || 'Ошибка при выходе из системы' },
      { status: 500 }
    );
  }
}
