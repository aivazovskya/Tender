import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateApiAuth } from '@/lib/security/auth';

const defaultProfile = {
  companyName: 'ТОО "КазИТ Сервис"',
  bin: '180940004512',
  activities: 'Поставка компьютерной техники, серверного оборудования, сетевых устройств, разработка ПО и системная интеграция.',
  keywords: ['Серверы', 'Сетевое оборудование', 'ИТ-услуги', 'ПО'],
  regions: ['г. Астана', 'г. Алматы', 'Карагандинская область'],
  minAmount: 5000000,
  maxAmount: 200000000,
  contactEmail: 'tender@kazit-service.kz',
  telegramChatId: '@kazit_tender_team'
};

export async function GET(request: NextRequest) {
  const auth = validateApiAuth(request);

  try {
    const profile = await prisma.companyProfile.findFirst({
      where: {
        OR: [
          { userId: auth.userId },
          { userId: null }
        ]
      }
    });

    if (profile) {
      return NextResponse.json({
        success: true,
        isFallback: false,
        profile
      });
    }
  } catch (error: any) {
    console.warn('[API /api/company-profile GET Fallback]:', error?.message);
  }

  return NextResponse.json({
    success: true,
    isFallback: true,
    profile: defaultProfile
  });
}

export async function POST(request: NextRequest) {
  const auth = validateApiAuth(request);
  if (!auth.authorized && auth.response) return auth.response;

  try {
    const body = await request.json();
    const {
      companyName,
      bin,
      activities,
      keywords,
      regions,
      minAmount,
      maxAmount,
      contactEmail,
      telegramChatId
    } = body;

    const targetBin = bin || '180940004512';

    // Anti-Takeover Security Check (Bug #14): Prevent overwriting CompanyProfile owned by another userId
    const existingByBin = await prisma.companyProfile.findUnique({
      where: { bin: targetBin }
    });

    if (existingByBin && existingByBin.userId && existingByBin.userId !== auth.userId) {
      console.warn(`[SECURITY ALERT] User ${auth.userId} attempted to overwrite CompanyProfile (BIN ${targetBin}) owned by ${existingByBin.userId}`);
      return NextResponse.json(
        { success: false, error: 'Conflict: Этот БИН уже привязан к другому аккаунту' },
        { status: 409 }
      );
    }

    const profile = await prisma.companyProfile.upsert({
      where: { bin: targetBin },
      update: {
        companyName,
        activities,
        keywords,
        regions,
        minAmount,
        maxAmount,
        contactEmail,
        telegramChatId,
        userId: auth.userId
      },
      create: {
        companyName,
        bin: targetBin,
        activities,
        keywords,
        regions,
        minAmount,
        maxAmount,
        contactEmail,
        telegramChatId,
        userId: auth.userId
      }
    });

    return NextResponse.json({ success: true, profile });
  } catch (error: any) {
    console.error('[API /api/company-profile POST Error]:', error?.message);
    return NextResponse.json({ success: false, message: error?.message || 'Ошибка сохранения профиля компании в БД' }, { status: 500 });
  }
}
