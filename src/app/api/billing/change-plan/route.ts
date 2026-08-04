import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateApiAuth } from '@/lib/security/auth';
import { TARIFF_PLANS } from '@/lib/services/kaspi.service';

export async function POST(request: NextRequest) {
  const auth = validateApiAuth(request);

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

    const nextExpiration = new Date();
    nextExpiration.setDate(nextExpiration.getDate() + 30);

    const profile = await prisma.companyProfile.findFirst({
      where: { userId: auth.userId }
    });

    if (profile) {
      await prisma.companyProfile.update({
        where: { id: profile.id },
        data: {
          subscriptionPlan: validPlan.id,
          subscriptionExpiresAt: nextExpiration
        }
      });
    }

    return NextResponse.json({
      success: true,
      message: `Тарифный план успешно изменен на ${validPlan.name}`,
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
