import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateApiAuth } from '@/lib/security/auth';

const emptyProfileTemplate = {
  companyName: '',
  bin: '',
  activities: '',
  keywords: [],
  regions: ['Все регионы'],
  minAmount: 0,
  maxAmount: 0,
  contactEmail: '',
  telegramChatId: ''
};

export async function GET(request: NextRequest) {
  const auth = validateApiAuth(request);

  try {
    let profile = await prisma.companyProfile.findFirst({
      where: { userId: auth.userId }
    });

    if (!profile) {
      profile = await prisma.companyProfile.findFirst();
    }

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
    profile: emptyProfileTemplate
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

    // Bug #24 Fix: Mandatory BIN Validation (no default fake BIN fallback)
    if (!bin || typeof bin !== 'string' || bin.trim().length === 0) {
      return NextResponse.json(
        { success: false, message: 'Поле БИН обязательно для заполнения' },
        { status: 400 }
      );
    }

    const targetBin = bin.trim();

    // Ensure User record exists to prevent FK violation on CompanyProfile.userId
    if (auth.userId) {
      await prisma.user.upsert({
        where: { id: auth.userId },
        update: {},
        create: { id: auth.userId, email: `${auth.userId}@tender.ai` }
      }).catch(() => {});
    }

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
        companyName: companyName || '',
        activities: activities || '',
        keywords: Array.isArray(keywords) ? keywords : [],
        regions: Array.isArray(regions) ? regions : ['Все регионы'],
        minAmount: typeof minAmount === 'number' ? minAmount : 0,
        maxAmount: typeof maxAmount === 'number' ? maxAmount : 0,
        contactEmail: contactEmail || '',
        telegramChatId: telegramChatId || '',
        userId: auth.userId
      },
      create: {
        companyName: companyName || '',
        bin: targetBin,
        activities: activities || '',
        keywords: Array.isArray(keywords) ? keywords : [],
        regions: Array.isArray(regions) ? regions : ['Все регионы'],
        minAmount: typeof minAmount === 'number' ? minAmount : 0,
        maxAmount: typeof maxAmount === 'number' ? maxAmount : 0,
        contactEmail: contactEmail || '',
        telegramChatId: telegramChatId || '',
        userId: auth.userId
      }
    });

    return NextResponse.json({ success: true, profile });
  } catch (error: any) {
    console.error('[API /api/company-profile POST Error]:', error?.message);
    return NextResponse.json({ success: false, message: error?.message || 'Ошибка сохранения профиля компании в БД' }, { status: 500 });
  }
}
