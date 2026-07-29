import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';


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

export async function GET() {
  try {
    const profile = await prisma.companyProfile.findFirst();

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

    const profile = await prisma.companyProfile.upsert({
      where: { bin: bin || '180940004512' },
      update: {
        companyName,
        activities,
        keywords,
        regions,
        minAmount,
        maxAmount,
        contactEmail,
        telegramChatId
      },
      create: {
        companyName,
        bin: bin || '180940004512',
        activities,
        keywords,
        regions,
        minAmount,
        maxAmount,
        contactEmail,
        telegramChatId
      }
    });

    return NextResponse.json({ success: true, profile });
  } catch (error: any) {
    console.error('[API /api/company-profile POST Error]:', error?.message);
    return NextResponse.json({ success: false, message: error?.message || 'Ошибка сохранения профиля компании в БД' }, { status: 500 });
  }
}
