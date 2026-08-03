import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateApiAuth } from '@/lib/security/auth';
import { TenderCalculationService } from '@/lib/services/tender-calculation.service';
import { Prisma } from '@prisma/client';

async function getOrCreateCompanyProfile(userId: string) {
  let profile = await prisma.companyProfile.findFirst({
    where: { userId }
  });

  if (!profile) {
    const cleanNum = userId.replace(/\D/g, '');
    const dummyBin = `880${cleanNum.padEnd(9, '0').slice(0, 9)}`;

    try {
      profile = await prisma.companyProfile.create({
        data: {
          userId,
          companyName: 'Моя Компания',
          bin: dummyBin,
          activities: 'Тендерные закупки',
          keywords: ['Товары', 'Услуги'],
          regions: ['Все регионы'],
          contactEmail: 'company@tenderai.kz'
        }
      });
    } catch (err) {
      profile = await prisma.companyProfile.findFirst() || await prisma.companyProfile.create({
        data: {
          companyName: 'Демо Компания',
          bin: `999${Date.now().toString().slice(-9)}`,
          activities: 'Демо закупки',
          keywords: [],
          regions: ['Все регионы'],
          contactEmail: 'demo@tenderai.kz'
        }
      });
    }
  }

  return profile;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = validateApiAuth(request, 'USER');
    if (!auth.authorized) {
      return auth.response || NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const tenderId = params.id;
    const tender = await prisma.tender.findUnique({
      where: { id: tenderId }
    });

    if (!tender) {
      return NextResponse.json({ success: false, error: 'Tender not found' }, { status: 404 });
    }

    const companyProfile = await getOrCreateCompanyProfile(auth.userId);

    let calculation = await prisma.tenderCalculation.findUnique({
      where: {
        tenderId_companyId: {
          tenderId: tender.id,
          companyId: companyProfile.id
        }
      },
      include: {
        costItems: true,
        tender: true,
        company: true
      }
    });

    if (!calculation) {
      const initialPurchaseAmount = tender.amount * 0.7;
      calculation = await prisma.tenderCalculation.create({
        data: {
          tenderId: tender.id,
          companyId: companyProfile.id,
          startPrice: new Prisma.Decimal(tender.amount),
          totalCost: new Prisma.Decimal(0),
          targetMarginPct: new Prisma.Decimal(15.0),
          minMarginPct: new Prisma.Decimal(5.0),
          recommendedPrice: new Prisma.Decimal(tender.amount),
          minAcceptablePrice: new Prisma.Decimal(tender.amount),
          costItems: {
            create: [
              {
                category: 'PURCHASE',
                label: 'Закупочная стоимость товара/материалов',
                valueType: 'PERCENTAGE',
                amount: new Prisma.Decimal(70.0),
                baseAmount: new Prisma.Decimal(tender.amount),
                computedAmount: new Prisma.Decimal(initialPurchaseAmount)
              },
              {
                category: 'LOGISTICS',
                label: 'Логистика и доставка',
                valueType: 'FIXED',
                amount: new Prisma.Decimal(50000),
                computedAmount: new Prisma.Decimal(50000)
              }
            ]
          }
        },
        include: {
          costItems: true,
          tender: true,
          company: true
        }
      });

      calculation = await TenderCalculationService.recalculate(calculation.id);
    }

    return NextResponse.json({
      success: true,
      data: TenderCalculationService.formatCalculationResponse(calculation)
    });
  } catch (err: any) {
    console.error('[TenderCalculation GET Error]:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = validateApiAuth(request, 'USER');
    if (!auth.authorized) {
      return auth.response || NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const tenderId = params.id;
    const body = await request.json();
    const companyProfile = await getOrCreateCompanyProfile(auth.userId);

    const calculation = await prisma.tenderCalculation.findUnique({
      where: {
        tenderId_companyId: {
          tenderId,
          companyId: companyProfile.id
        }
      }
    });

    if (!calculation) {
      return NextResponse.json(
        { success: false, error: 'TenderCalculation not found or unauthorized' },
        { status: 404 }
      );
    }

    const updateData: any = {};
    if (body.targetMarginPct !== undefined) {
      updateData.targetMarginPct = new Prisma.Decimal(body.targetMarginPct);
    }
    if (body.minMarginPct !== undefined) {
      updateData.minMarginPct = new Prisma.Decimal(body.minMarginPct);
    }
    if (body.startPrice !== undefined) {
      updateData.startPrice = new Prisma.Decimal(body.startPrice);
    }

    await prisma.tenderCalculation.update({
      where: { id: calculation.id },
      data: updateData
    });

    const updated = await TenderCalculationService.recalculate(calculation.id);

    return NextResponse.json({
      success: true,
      data: TenderCalculationService.formatCalculationResponse(updated)
    });
  } catch (err: any) {
    console.error('[TenderCalculation PATCH Error]:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
