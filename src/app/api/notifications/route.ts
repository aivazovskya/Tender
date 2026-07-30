import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateApiAuth } from '@/lib/security/auth';

const defaultSettings = {
  telegramNotify: true,
  emailNotify: false,
  minRiskNotify: 50
};

export async function GET(request: NextRequest) {
  const auth = validateApiAuth(request);

  try {
    const settings = await prisma.notificationSetting.findUnique({
      where: { userId: auth.userId }
    });

    if (settings) {
      return NextResponse.json({
        success: true,
        isFallback: false,
        settings
      });
    }
  } catch (error: any) {
    console.warn('[API /api/notifications GET Fallback]:', error?.message);
  }

  return NextResponse.json({
    success: true,
    isFallback: true,
    settings: defaultSettings
  });
}

export async function POST(request: NextRequest) {
  const auth = validateApiAuth(request);
  if (!auth.authorized && auth.response) return auth.response;

  try {
    const body = await request.json();
    const { telegramNotify, emailNotify, minRiskNotify } = body;
    const uid = auth.userId;

    // Ensure User record exists before upserting NotificationSetting
    await prisma.user.upsert({
      where: { id: uid },
      update: {},
      create: {
        id: uid,
        email: `${uid}@tenderai.kz`,
        name: 'Пользователь TenderAI'
      }
    }).catch(() => {});

    const settings = await prisma.notificationSetting.upsert({
      where: { userId: uid },
      update: {
        telegramNotify,
        emailNotify,
        minRiskNotify
      },
      create: {
        userId: uid,
        telegramNotify,
        emailNotify,
        minRiskNotify
      }
    });

    return NextResponse.json({ success: true, settings });
  } catch (error: any) {
    console.error('[API /api/notifications POST Error]:', error?.message);
    return NextResponse.json({ success: false, message: error?.message || 'Ошибка сохранения настроек уведомлений в БД' }, { status: 500 });
  }
}

