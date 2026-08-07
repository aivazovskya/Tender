import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateApiAuth } from '@/lib/security/auth';
import { resolveOwnCompanyProfile } from '@/lib/security/resolve-company-profile';
import { DEFAULT_PENALTY_RATE_PER_DAY } from '@/lib/constants/tender-risk';

export async function GET(
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

    let execution = await prisma.contractExecution.findUnique({
      where: { tenderId },
      include: {
        milestones: { orderBy: { dueDate: 'asc' } },
        tender: { select: { amount: true, title: true, externalId: true, riskScore: true } }
      }
    });

    if (!execution || execution.companyProfileId !== companyProfile.id) {
      return NextResponse.json(
        { success: false, message: 'Исполнение контракта не найдено' },
        { status: 404 }
      );
    }

    // Dynamic auto-marking of OVERDUE milestones
    const now = new Date();
    let updatedMilestones = false;

    for (const milestone of execution.milestones) {
      if (milestone.status === 'PENDING' && !milestone.completedAt && new Date(milestone.dueDate) < now) {
        await prisma.contractMilestone.update({
          where: { id: milestone.id },
          data: { status: 'OVERDUE' }
        });
        updatedMilestones = true;
      }
    }

    if (updatedMilestones) {
      execution = await prisma.contractExecution.findUnique({
        where: { tenderId },
        include: {
          milestones: { orderBy: { dueDate: 'asc' } },
          tender: { select: { amount: true, title: true, externalId: true, riskScore: true } }
        }
      });
    }

    // Calculate delay and actual penalty if delivered late
    let delayDays = 0;
    let actualPenaltyAmount = 0;
    const deadline = new Date(execution!.deliveryDeadline);
    const deliveryDate = execution!.actualDeliveryDate ? new Date(execution!.actualDeliveryDate) : now;

    if (deliveryDate > deadline) {
      delayDays = Math.ceil((deliveryDate.getTime() - deadline.getTime()) / (1000 * 3600 * 24));
      actualPenaltyAmount = Math.round(delayDays * DEFAULT_PENALTY_RATE_PER_DAY * Number(execution!.tender.amount));
    }

    // Calculate Payment & Act Metrics
    let expectedPaymentSum = 0;
    let receivedPaymentSum = 0;
    const disputedMilestones: any[] = [];

    for (const m of execution!.milestones) {
      const amt = Number(m.paymentAmount || 0);
      if (m.paidAt) {
        receivedPaymentSum += amt;
      } else {
        expectedPaymentSum += amt;
      }

      if (m.actStatus === 'DISPUTED') {
        disputedMilestones.push(m);
      }
    }

    return NextResponse.json({
      success: true,
      execution,
      metrics: {
        delayDays,
        actualPenaltyAmount,
        isOverdue: !execution!.actualDeliveryDate && now > deadline,
        totalContractAmount: Number(execution!.tender.amount),
        expectedPaymentSum,
        receivedPaymentSum,
        disputedMilestonesCount: disputedMilestones.length,
        disputedMilestones
      }
    });
  } catch (error: any) {
    console.error('[API /api/tenders/[id]/contract-execution GET Error]:', error?.message);
    return NextResponse.json(
      { success: false, message: error?.message || 'Ошибка загрузки исполнения контракта' },
      { status: 500 }
    );
  }
}

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

    const body = await request.json();
    const { contractSignedAt, deliveryDeadline, milestones } = body;

    if (!deliveryDeadline) {
      return NextResponse.json({ success: false, message: 'Укажите крайний срок поставки (deliveryDeadline)' }, { status: 400 });
    }

    const existing = await prisma.contractExecution.findUnique({ where: { tenderId } });
    if (existing) {
      return NextResponse.json({ success: false, message: 'Исполнение по этому контракту уже создано' }, { status: 400 });
    }

    const execution = await prisma.contractExecution.create({
      data: {
        tenderId,
        companyProfileId: companyProfile.id,
        contractSignedAt: contractSignedAt ? new Date(contractSignedAt) : new Date(),
        deliveryDeadline: new Date(deliveryDeadline),
        status: 'IN_PROGRESS',
        milestones: milestones && Array.isArray(milestones) ? {
          create: milestones.map((m: any) => ({
            label: m.label,
            dueDate: new Date(m.dueDate),
            status: 'PENDING',
            paymentAmount: m.paymentAmount ? Number(m.paymentAmount) : null,
            actStatus: m.actStatus || 'NOT_SUBMITTED',
            actSignedAt: m.actSignedAt ? new Date(m.actSignedAt) : null,
            paidAt: m.paidAt ? new Date(m.paidAt) : null
          }))
        } : undefined
      },
      include: { milestones: true }
    });

    return NextResponse.json({ success: true, execution });
  } catch (error: any) {
    console.error('[API /api/tenders/[id]/contract-execution POST Error]:', error?.message);
    return NextResponse.json(
      { success: false, message: error?.message || 'Ошибка создания исполнения контракта' },
      { status: 500 }
    );
  }
}

export async function PATCH(
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

    const existing = await prisma.contractExecution.findUnique({ where: { tenderId } });
    if (!existing || existing.companyProfileId !== companyProfile.id) {
      return NextResponse.json({ success: false, message: 'Исполнение контракта не найдено' }, { status: 404 });
    }

    const body = await request.json();
    const { actualDeliveryDate, status, deliveryDeadline, contractSignedAt } = body;

    const updateData: any = {};

    if (contractSignedAt) updateData.contractSignedAt = new Date(contractSignedAt);
    if (deliveryDeadline) updateData.deliveryDeadline = new Date(deliveryDeadline);

    if (actualDeliveryDate !== undefined) {
      const actDate = actualDeliveryDate ? new Date(actualDeliveryDate) : null;
      updateData.actualDeliveryDate = actDate;

      if (actDate) {
        const deadline = deliveryDeadline ? new Date(deliveryDeadline) : new Date(existing.deliveryDeadline);
        if (actDate <= deadline) {
          updateData.status = 'DELIVERED_ON_TIME';
        } else {
          updateData.status = 'DELIVERED_LATE';
        }
      }
    }

    if (status) {
      updateData.status = status;
    }

    const updated = await prisma.contractExecution.update({
      where: { tenderId },
      data: updateData,
      include: { milestones: true }
    });

    return NextResponse.json({ success: true, execution: updated });
  } catch (error: any) {
    console.error('[API /api/tenders/[id]/contract-execution PATCH Error]:', error?.message);
    return NextResponse.json(
      { success: false, message: error?.message || 'Ошибка обновления исполнения контракта' },
      { status: 500 }
    );
  }
}
