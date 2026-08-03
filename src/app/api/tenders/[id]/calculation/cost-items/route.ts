import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateApiAuth } from '@/lib/security/auth';
import { TenderCalculationService } from '@/lib/services/tender-calculation.service';
import { Prisma } from '@prisma/client';

async function getCompanyProfile(userId: string) {
  return await prisma.companyProfile.findFirst({ where: { userId } });
}

export async function POST(
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
    const { category, label, valueType, amount, baseAmount } = body;

    if (!category || !label || !valueType || amount === undefined) {
      return NextResponse.json(
        { success: false, error: 'Missing required cost item fields (category, label, valueType, amount)' },
        { status: 400 }
      );
    }

    const companyProfile = await getCompanyProfile(auth.userId);
    if (!companyProfile) {
      return NextResponse.json({ success: false, error: 'Company profile not found' }, { status: 404 });
    }

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
        { success: false, error: 'TenderCalculation not found for this company' },
        { status: 404 }
      );
    }

    const numAmount = parseFloat(amount);
    const numBase = baseAmount != null ? parseFloat(baseAmount) : null;
    let initialComputed = numAmount;
    if (valueType === 'PERCENTAGE') {
      const calcBase = numBase != null ? numBase : parseFloat(calculation.startPrice.toString());
      initialComputed = calcBase * (numAmount / 100);
    }

    await prisma.tenderCostItem.create({
      data: {
        calculationId: calculation.id,
        category,
        label,
        valueType,
        amount: new Prisma.Decimal(numAmount),
        baseAmount: numBase != null ? new Prisma.Decimal(numBase) : null,
        computedAmount: new Prisma.Decimal(initialComputed)
      }
    });

    const updatedCalculation = await TenderCalculationService.recalculate(calculation.id);

    return NextResponse.json({
      success: true,
      data: TenderCalculationService.formatCalculationResponse(updatedCalculation)
    });
  } catch (err: any) {
    console.error('[TenderCostItem POST Error]:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
