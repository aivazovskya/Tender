import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateApiAuth } from '@/lib/security/auth';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; milestoneId: string } }
) {
  const auth = validateApiAuth(request);
  if (!auth.authorized && auth.response) return auth.response;

  const { milestoneId } = params;

  try {
    const existing = await prisma.contractMilestone.findUnique({ where: { id: milestoneId } });
    if (!existing) {
      return NextResponse.json({ success: false, message: 'Этап контракта не найден' }, { status: 404 });
    }

    const body = await request.json();
    const { isCompleted, status, label, dueDate } = body;

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
