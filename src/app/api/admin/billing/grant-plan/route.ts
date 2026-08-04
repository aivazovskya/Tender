import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateApiAuth } from '@/lib/security/auth';
import { TARIFF_PLANS } from '@/lib/services/kaspi.service';

export async function POST(request: NextRequest) {
  const auth = validateApiAuth(request, 'ADMIN');
  if (!auth.authorized) {
    return auth.response!;
  }

  try {
    const body = await request.json();
    const { bin, planId, reason } = body;

    if (!bin || !planId || !reason || typeof reason !== 'string' || reason.trim().length === 0) {
      return NextResponse.json(
        { success: false, message: 'Поля bin, planId и причину (reason) необходимо указать' },
        { status: 400 }
      );
    }

    const validPlan = TARIFF_PLANS.find(p => p.id === planId);
    if (!validPlan) {
      return NextResponse.json(
        { success: false, message: 'Неверный идентификатор тарифного плана' },
        { status: 400 }
      );
    }

    const targetBin = String(bin).trim();
    const profile = await prisma.companyProfile.findUnique({
      where: { bin: targetBin }
    });

    if (!profile) {
      return NextResponse.json(
        { success: false, message: 'Профиль компании с данным БИН не найден' },
        { status: 404 }
      );
    }

    const nextExpiration = new Date();
    nextExpiration.setDate(nextExpiration.getDate() + 30);
    const oldPlan = profile.subscriptionPlan;

    await prisma.$transaction([
      prisma.companyProfile.update({
        where: { id: profile.id },
        data: {
          subscriptionPlan: validPlan.id,
          subscriptionExpiresAt: validPlan.id === 'FREE' ? null : nextExpiration
        }
      }),
      prisma.billingAuditLog.create({
        data: {
          companyProfileId: profile.id,
          action: 'ADMIN_GRANT_PLAN',
          oldPlan,
          newPlan: validPlan.id,
          reason: reason.trim(),
          performedBy: auth.userId
        }
      })
    ]);

    return NextResponse.json({
      success: true,
      message: `Администратор выдал тариф ${validPlan.name} для БИН ${targetBin}`,
      tariffPlan: validPlan.id
    });
  } catch (error: any) {
    console.error('[API /api/admin/billing/grant-plan Error]:', error?.message);
    return NextResponse.json(
      { success: false, message: error?.message || 'Ошибка ручного назначения тарифа' },
      { status: 500 }
    );
  }
}
