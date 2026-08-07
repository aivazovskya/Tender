import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateApiAuth } from '@/lib/security/auth';
import { resolveOwnCompanyProfile } from '@/lib/security/resolve-company-profile';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await validateApiAuth(request);
  if (!auth.authorized && auth.response) return auth.response;

  const tenderId = params.id;

  try {
    const companyProfile = await resolveOwnCompanyProfile(auth.userId);
    if (!companyProfile) {
      return NextResponse.json(
        { success: false, message: 'Профиль компании не найден' },
        { status: 404 }
      );
    }

    const contract = await prisma.contractExecution.findUnique({ where: { tenderId } });
    if (!contract || contract.companyProfileId !== companyProfile.id) {
      return NextResponse.json({ success: false, message: 'Исполнение контракта не найдено' }, { status: 404 });
    }

    const body = await request.json();
    const { label, dueDate, paymentAmount, actStatus, actSignedAt, paidAt } = body;

    if (!label || !dueDate) {
      return NextResponse.json({ success: false, message: 'Укажите наименование этапа и срок (label, dueDate)' }, { status: 400 });
    }

    const milestone = await prisma.contractMilestone.create({
      data: {
        contractId: contract.id,
        label: label.trim(),
        dueDate: new Date(dueDate),
        status: 'PENDING',
        paymentAmount: paymentAmount ? Number(paymentAmount) : null,
        actStatus: actStatus || 'NOT_SUBMITTED',
        actSignedAt: actSignedAt ? new Date(actSignedAt) : null,
        paidAt: paidAt ? new Date(paidAt) : null
      }
    });

    return NextResponse.json({ success: true, milestone });
  } catch (error: any) {
    console.error('[API /api/tenders/[id]/contract-execution/milestones POST Error]:', error?.message);
    return NextResponse.json(
      { success: false, message: error?.message || 'Ошибка добавления этапа контракта' },
      { status: 500 }
    );
  }
}
