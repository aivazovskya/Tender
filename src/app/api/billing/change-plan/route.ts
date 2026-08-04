import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateApiAuth } from '@/lib/security/auth';
import { TARIFF_PLANS } from '@/lib/services/kaspi.service';

export async function POST(request: NextRequest) {
  const auth = validateApiAuth(request);
  if (!auth.authorized) {
    return auth.response!;
  }

  try {
    const body = await request.json();
    const { planId } = body;

    const validPlan = TARIFF_PLANS.find(p => p.id === planId);
    if (!validPlan) {
      return NextResponse.json(
        { success: false, message: 'Неверный идентификатор тарифного плана' },
        { status: 400 }
      );
    }

    let profile = await prisma.companyProfile.findFirst({
      where: { userId: auth.userId }
    });

    if (!profile) {
      profile = await prisma.companyProfile.findFirst();
    }

    if (!profile) {
      return NextResponse.json(
        { success: false, message: 'Профиль компании не найден' },
        { status: 404 }
      );
    }

    const currentPlanRank = TARIFF_PLANS.findIndex(p => p.id === profile.subscriptionPlan);
    const targetPlanRank = TARIFF_PLANS.findIndex(p => p.id === validPlan.id);

    // Downgrade or transition to FREE is allowed without payment.
    const isDowngradeOrFree = validPlan.id === 'FREE' || targetPlanRank <= currentPlanRank;

    if (!isDowngradeOrFree) {
      return NextResponse.json(
        {
          success: false,
          message: 'Повышение тарифа доступно только после оплаты через Kaspi Pay',
          requiresPayment: true
        },
        { status: 402 } // Payment Required
      );
    }

    await prisma.companyProfile.update({
      where: { id: profile.id },
      data: {
        subscriptionPlan: validPlan.id,
        subscriptionExpiresAt: validPlan.id === 'FREE' ? null : profile.subscriptionExpiresAt
      }
    });

    return NextResponse.json({
      success: true,
      message: `Тарифный план изменён на ${validPlan.name}`,
      tariffPlan: validPlan.id
    });
  } catch (error: any) {
    console.error('[API /api/billing/change-plan POST Error]:', error?.message);
    return NextResponse.json(
      { success: false, message: error?.message || 'Ошибка смены тарифного плана' },
      { status: 500 }
    );
  }
}
