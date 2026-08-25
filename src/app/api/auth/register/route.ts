import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { findUserByEmail, createUser } from '@/lib/security/auth-store';

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

    // Create user with status 'PENDING'
    const user = await createUser({
      email: normalizedEmail,
      passwordHash,
      name: name ? String(name).trim() : null,
      role: 'USER',
      status: 'PENDING'
    });

    // DO NOT create session on registration — user must be approved by admin first
    return NextResponse.json({
      success: true,
      pending: true,
      message: 'Заявка на регистрацию принята. Ожидайте одобрения администратором системы.',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        status: user.status,
        createdAt: user.createdAt
      }
    });
  } catch (error: any) {
    if (error?.message === 'AUTH_STORE_UNAVAILABLE' || error?.name === 'AuthStoreUnavailableError') {
      return NextResponse.json(
        { success: false, message: 'Сервис авторизации временно недоступен. Попробуйте позже.' },
        { status: 503 }
      );
    }
    console.error('[API /api/auth/register Error]:', error?.message);
    return NextResponse.json(
      { success: false, message: error?.message || 'Ошибка при регистрации пользователя' },
      { status: 500 }
    );
  }
}
