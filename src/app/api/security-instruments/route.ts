import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateApiAuth } from '@/lib/security/auth';
import { resolveOwnCompanyProfile } from '@/lib/security/resolve-company-profile';

export async function GET(request: NextRequest) {
  const auth = validateApiAuth(request);
  const { searchParams } = new URL(request.url);

  const statusFilter = searchParams.get('status');
  const expiringWithinDays = searchParams.get('expiringWithinDays');
  const tenderId = searchParams.get('tenderId');

  try {
    // Resolve user's own CompanyProfile (strictly isolated per user)
    const companyProfile = await resolveOwnCompanyProfile(auth.userId);

    if (!companyProfile) {
      return NextResponse.json(
        { success: false, message: 'Профиль компании не найден. Сначала заполните профиль компании.' },
        { status: 404 }
      );
    }

    const whereClause: any = {
      companyProfileId: companyProfile.id
    };

    if (tenderId) {
      whereClause.tenderId = tenderId;
    }

    if (statusFilter && statusFilter !== 'ALL') {
      whereClause.status = statusFilter;
    }

    if (expiringWithinDays) {
      const days = parseInt(expiringWithinDays, 10);
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + days);

      whereClause.expiryDate = {
        gte: new Date(),
        lte: futureDate
      };
      whereClause.status = 'ACTIVE';
    }

    const instruments = await prisma.securityInstrument.findMany({
      where: whereClause,
      include: {
        tender: {
          select: {
            id: true,
            title: true,
            externalId: true,
            customerName: true,
            amount: true
          }
        }
      },
      orderBy: { expiryDate: 'asc' }
    });

    // Compute Summary Stats for Active Instruments
    const activeInstruments = instruments.filter(i => i.status === 'ACTIVE');
    const totalActiveAmount = activeInstruments.reduce((acc, i) => acc + Number(i.amount), 0);

    const now = new Date();
    const fourteenDaysLater = new Date();
    fourteenDaysLater.setDate(now.getDate() + 14);

    const expiringCount14Days = activeInstruments.filter(i => {
      const exp = new Date(i.expiryDate);
      return exp >= now && exp <= fourteenDaysLater;
    }).length;

    const forfeitedInstruments = instruments.filter(i => i.status === 'FORFEITED');
    const totalForfeitedAmount = forfeitedInstruments.reduce((acc, i) => acc + Number(i.amount), 0);

    return NextResponse.json({
      success: true,
      instruments: instruments.map(i => ({
        ...i,
        amount: Number(i.amount)
      })),
      summary: {
        totalActiveAmount,
        activeCount: activeInstruments.length,
        expiringCount14Days,
        totalForfeitedAmount,
        forfeitedCount: forfeitedInstruments.length
      }
    });
  } catch (error: any) {
    console.error('[API /api/security-instruments GET Error]:', error?.message);
    return NextResponse.json(
      { success: false, message: error?.message || 'Ошибка загрузки реестра обеспечений' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = validateApiAuth(request);
  if (!auth.authorized && auth.response) return auth.response;

  try {
    const body = await request.json();
    const {
      tenderId,
      companyProfileId,
      type,
      amount,
      issuedByBank,
      issueDate,
      expiryDate,
      documentUrl
    } = body;

    if (!tenderId || !type || !amount || !issueDate || !expiryDate) {
      return NextResponse.json(
        { success: false, message: 'Заполните обязательные поля (tenderId, type, amount, issueDate, expiryDate)' },
        { status: 400 }
      );
    }

    // Resolve company profile if not explicitly passed
    let targetProfileId = companyProfileId;
    if (!targetProfileId) {
      const profile = await resolveOwnCompanyProfile(auth.userId);
      if (!profile) {
        return NextResponse.json(
          { success: false, message: 'Профиль компании не найден. Сначала заполните профиль компании.' },
          { status: 404 }
        );
      }
      targetProfileId = profile.id;
    } else {
      // Verify explicitly passed companyProfileId belongs to the authenticated user
      const userProfile = await resolveOwnCompanyProfile(auth.userId);
      if (!userProfile || userProfile.id !== targetProfileId) {
        return NextResponse.json(
          { success: false, message: 'Forbidden: Нельзя создавать записи для чужого профиля компании.' },
          { status: 403 }
        );
      }
    }

    const instrument = await prisma.securityInstrument.create({
      data: {
        tenderId,
        companyProfileId: targetProfileId,
        type,
        amount: Number(amount),
        issuedByBank: issuedByBank ? issuedByBank.trim() : null,
        issueDate: new Date(issueDate),
        expiryDate: new Date(expiryDate),
        status: 'ACTIVE',
        documentUrl: documentUrl || null
      },
      include: {
        tender: {
          select: { title: true, externalId: true }
        }
      }
    });

    return NextResponse.json({
      success: true,
      instrument: {
        ...instrument,
        amount: Number(instrument.amount)
      }
    });
  } catch (error: any) {
    console.error('[API /api/security-instruments POST Error]:', error?.message);
    return NextResponse.json(
      { success: false, message: error?.message || 'Ошибка создания обеспечения' },
      { status: 500 }
    );
  }
}
