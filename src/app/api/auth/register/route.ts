import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { findUserByEmail, createUser, createSession } from '@/lib/security/auth-store';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, name } = body || {};

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json(
        { success: false, message: 'Укажите корректный адрес электронной почты' },
        { status: 400 }
      );
    }

    if (!password || typeof password !== 'string' || password.length < 8) {
      return NextResponse.json(
        { success: false, message: 'Пароль должен содержать не менее 8 символов' },
        { status: 400 }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check existing user
    const existingUser = await findUserByEmail(normalizedEmail);

    if (existingUser) {
      return NextResponse.json(
        { success: false, message: 'Не удалось зарегистрироваться. Проверьте данные или попробуйте войти.' },
        { status: 400 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await createUser({
      email: normalizedEmail,
      passwordHash,
      name: name ? String(name).trim() : null
    });

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
    console.error('[API /api/auth/register Error]:', error?.message);
    return NextResponse.json(
      { success: false, message: error?.message || 'Ошибка при регистрации пользователя' },
      { status: 500 }
    );
  }
}
