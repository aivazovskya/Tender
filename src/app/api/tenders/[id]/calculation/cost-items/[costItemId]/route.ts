import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateApiAuth } from '@/lib/security/auth';
import { TenderCalculationService } from '@/lib/services/tender-calculation.service';
import { Prisma } from '@prisma/client';

async function getCompanyProfile(userId: string) {
  return await prisma.companyProfile.findFirst({ where: { userId } });
}

async function getUserEmail(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  return user?.email || userId;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; costItemId: string } }
) {
  try {
    const auth = await validateApiAuth(request, 'USER');
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
    const userEmail = await getUserEmail(auth.userId);

    const updateData: any = {};
    if (body.category !== undefined) updateData.category = body.category;
    if (body.label !== undefined) updateData.label = body.label;
    if (body.valueType !== undefined) updateData.valueType = body.valueType;
    if (body.amount !== undefined) updateData.amount = new Prisma.Decimal(body.amount);
    if (body.baseAmount !== undefined) {
      updateData.baseAmount = body.baseAmount != null ? new Prisma.Decimal(body.baseAmount) : null;
    }

    const oldState = {
      category: costItem.category,
      label: costItem.label,
      valueType: costItem.valueType,
      amount: parseFloat(costItem.amount.toString()),
      baseAmount: costItem.baseAmount != null ? parseFloat(costItem.baseAmount.toString()) : null
    };

    await prisma.$transaction(async (tx) => {
      const updated = await tx.tenderCostItem.update({
        where: { id: costItemId },
        data: updateData
      });

      const newState = {
        category: updated.category,
        label: updated.label,
        valueType: updated.valueType,
        amount: parseFloat(updated.amount.toString()),
        baseAmount: updated.baseAmount != null ? parseFloat(updated.baseAmount.toString()) : null
      };

      await tx.tenderAuditTrail.create({
        data: {
          tenderId: costItem.calculation.tenderId,
          field: `costItem:${updated.category}:${updated.label}`,
          oldValue: JSON.stringify(oldState),
          newValue: JSON.stringify(newState),
          changedBy: userEmail
        }
      });
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
    const auth = await validateApiAuth(request, 'USER');
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

    const userEmail = await getUserEmail(auth.userId);
    const calculationId = costItem.calculationId;

    const oldState = {
      category: costItem.category,
      label: costItem.label,
      valueType: costItem.valueType,
      amount: parseFloat(costItem.amount.toString()),
      baseAmount: costItem.baseAmount != null ? parseFloat(costItem.baseAmount.toString()) : null
    };

    await prisma.$transaction(async (tx) => {
      await tx.tenderCostItem.delete({
        where: { id: costItemId }
      });

      await tx.tenderAuditTrail.create({
        data: {
          tenderId: costItem.calculation.tenderId,
          field: `costItem:${costItem.category}:${costItem.label}`,
          oldValue: JSON.stringify(oldState),
          newValue: null,
          changedBy: userEmail
        }
      });
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
