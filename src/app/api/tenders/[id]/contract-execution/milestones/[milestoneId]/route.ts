import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { validateApiAuth } from '@/lib/security/auth';
import { resolveOwnCompanyProfile } from '@/lib/security/resolve-company-profile';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; milestoneId: string } }
) {
  const auth = await validateApiAuth(request);
  if (!auth.authorized && auth.response) return auth.response;

  const { milestoneId } = params;

  try {
    const companyProfile = await resolveOwnCompanyProfile(auth.userId);
    if (!companyProfile) {
      return NextResponse.json(
        { success: false, message: 'Профиль компании не найден' },
        { status: 404 }
      );
    }

    const existing = await prisma.contractMilestone.findUnique({
      where: { id: milestoneId },
      include: { contract: true }
    });

    if (!existing || existing.contract.companyProfileId !== companyProfile.id) {
      return NextResponse.json({ success: false, message: 'Этап контракта не найден' }, { status: 404 });
    }

    const body = await request.json();
    const { isCompleted, status, label, dueDate, paymentAmount, actStatus, actSignedAt, paidAt } = body;

    const updateData: any = {};

    if (typeof isCompleted === 'boolean') {
      if (isCompleted) {
        updateData.status = 'DONE';
        updateData.completedAt = new Date();
      } else {
        updateData.status = new Date(existing.dueDate) < new Date() ? 'OVERDUE' : 'PENDING';
        updateData.completedAt = null;
      }
    }

    if (status) updateData.status = status;
    if (label) updateData.label = label.trim();
    if (dueDate) updateData.dueDate = new Date(dueDate);

    if (paymentAmount !== undefined) updateData.paymentAmount = paymentAmount != null ? new Prisma.Decimal(paymentAmount) : null;
    if (actStatus) updateData.actStatus = actStatus;
    if (actSignedAt !== undefined) updateData.actSignedAt = actSignedAt ? new Date(actSignedAt) : null;
    if (paidAt !== undefined) updateData.paidAt = paidAt ? new Date(paidAt) : null;

    const updated = await prisma.contractMilestone.update({
      where: { id: milestoneId },
      data: updateData
    });

    return NextResponse.json({ success: true, milestone: updated });
  } catch (error: any) {
    console.error('[API /api/tenders/[id]/contract-execution/milestones/[milestoneId] PATCH Error]:', error?.message);
    return NextResponse.json(
      { success: false, message: error?.message || 'Ошибка обновления этапа контракта' },
      { status: 500 }
    );
  }
}
