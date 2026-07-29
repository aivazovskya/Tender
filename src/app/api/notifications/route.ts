import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const defaultSettings = {
  telegramNotify: true,
  emailNotify: false,
  minRiskNotify: 50
};

export async function GET() {
  try {
    const settings = await prisma.notificationSetting.findFirst();

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
  try {
    const body = await request.json();
    const { userId, telegramNotify, emailNotify, minRiskNotify } = body;
    const uid = userId || 'usr_default';

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
