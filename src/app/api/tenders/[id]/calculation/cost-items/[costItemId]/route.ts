import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateApiAuth } from '@/lib/security/auth';
import { TenderCalculationService } from '@/lib/services/tender-calculation.service';
import { Prisma } from '@prisma/client';

async function getCompanyProfile(userId: string) {
  return await prisma.companyProfile.findFirst({ where: { userId } });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; costItemId: string } }
) {
  try {
    const auth = validateApiAuth(request, 'USER');
    if (!auth.authorized) {
      return auth.response || NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id: tenderId, costItemId } = params;
    const companyProfile = await getCompanyProfile(auth.userId);
    if (!companyProfile) {
      return NextResponse.json({ success: false, error: 'Company profile not found' }, { status: 404 });
    }

    const costItem = await prisma.tenderCostItem.findUnique({
      where: { id: costItemId },
      include: { calculation: true }
    });

    if (!costItem || costItem.calculation.companyId !== companyProfile.id || costItem.calculation.tenderId !== tenderId) {
      return NextResponse.json(
        { success: false, error: 'Cost item not found or access denied' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const updateData: any = {};
    if (body.category !== undefined) updateData.category = body.category;
    if (body.label !== undefined) updateData.label = body.label;
    if (body.valueType !== undefined) updateData.valueType = body.valueType;
    if (body.amount !== undefined) updateData.amount = new Prisma.Decimal(body.amount);
    if (body.baseAmount !== undefined) {
      updateData.baseAmount = body.baseAmount != null ? new Prisma.Decimal(body.baseAmount) : null;
    }

    await prisma.tenderCostItem.update({
      where: { id: costItemId },
      data: updateData
    });

    const updatedCalculation = await TenderCalculationService.recalculate(costItem.calculationId);

    return NextResponse.json({
      success: true,
      data: TenderCalculationService.formatCalculationResponse(updatedCalculation)
    });
  } catch (err: any) {
    console.error('[TenderCostItem PATCH Error]:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; costItemId: string } }
) {
  try {
    const auth = validateApiAuth(request, 'USER');
    if (!auth.authorized) {
      return auth.response || NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id: tenderId, costItemId } = params;
    const companyProfile = await getCompanyProfile(auth.userId);
    if (!companyProfile) {
      return NextResponse.json({ success: false, error: 'Company profile not found' }, { status: 404 });
    }

    const costItem = await prisma.tenderCostItem.findUnique({
      where: { id: costItemId },
      include: { calculation: true }
    });

    if (!costItem || costItem.calculation.companyId !== companyProfile.id || costItem.calculation.tenderId !== tenderId) {
      return NextResponse.json(
        { success: false, error: 'Cost item not found or access denied' },
        { status: 404 }
      );
    }

    const calculationId = costItem.calculationId;
    await prisma.tenderCostItem.delete({
      where: { id: costItemId }
    });

    const updatedCalculation = await TenderCalculationService.recalculate(calculationId);

    return NextResponse.json({
      success: true,
      data: TenderCalculationService.formatCalculationResponse(updatedCalculation)
    });
  } catch (err: any) {
    console.error('[TenderCostItem DELETE Error]:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
