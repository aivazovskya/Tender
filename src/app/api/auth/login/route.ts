import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { 
  findUserByEmail, 
  createSession, 
  getRecentFailedAttemptsCount, 
  recordLoginAttempt 
} from '@/lib/security/auth-store';

const DUMMY_HASH = '$2a$12$e865f3v29uG2aO0w4xYgU.3w0U2S0uG2aO0w4xYgU.3w0U2S0uG2a';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body || {};

    if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
      return NextResponse.json(
        { success: false, message: 'Укажите email и пароль' },
        { status: 400 }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();

    // 1. Rate limiting check (max 5 failed attempts in 15 minutes per email)
    const recentFailedAttempts = await getRecentFailedAttemptsCount(normalizedEmail);

    if (recentFailedAttempts >= 5) {
      return NextResponse.json(
        { success: false, message: 'Слишком много неудачных попыток входа. Попробуйте через 15 минут.' },
        { status: 429 }
      );
    }

    // 2. Find user & verify password
    const user = await findUserByEmail(normalizedEmail);

    const isMatch = await bcrypt.compare(
      password,
      user?.passwordHash ? user.passwordHash : DUMMY_HASH
    );

    if (!user || !user.passwordHash || !isMatch) {
      await recordLoginAttempt(normalizedEmail, user?.id || null, false);

      return NextResponse.json(
        { success: false, message: 'Неверный email или пароль' },
        { status: 401 }
      );
    }

    await recordLoginAttempt(normalizedEmail, user.id, true);

    const userAgent = request.headers.get('user-agent') || undefined;
    const session = await createSession(user.id, userAgent);

    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: user.createdAt
      }
    });

    response.cookies.set('tender_session_id', session.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60
    });

    return response;
  } catch (error: any) {
    console.error('[API /api/auth/login Error]:', error?.message);
    return NextResponse.json(
      { success: false, message: error?.message || 'Ошибка при входе в систему' },
      { status: 500 }
    );
  }
}
