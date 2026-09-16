import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateApiAuth } from '@/lib/security/auth';
import { TARIFF_PLANS } from '@/lib/services/kaspi.service';

export async function POST(request: NextRequest) {
  const auth = await validateApiAuth(request);
  if (!auth.authorized && auth.response) {
    return auth.response;
  }

  try {
    const body = await request.json();
    const { tariffId, organizationId: bodyOrgId } = body;

    // Security check (Bug #8): Validate tariffId and calculate price server-side
    const plan = TARIFF_PLANS.find(p => p.id === (tariffId || 'PRO'));
    if (!plan) {
      return NextResponse.json({ success: false, message: 'Неизвестный или недействительный тариф' }, { status: 400 });
    }

    const amountKzt = plan.priceKztMonth;
    const effectiveTariffId = plan.id;

    const orderId = `ORD-KZ-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    let qrPayload = `https://kaspi.kz/pay/TenderAI?service_id=88491&order_id=${orderId}&amount=${amountKzt}`;

    const apiKey = process.env.KASPI_PAY_API_KEY;
    if (apiKey && apiKey.trim().length > 0 && !apiKey.includes('your_')) {
      try {
        const kaspiRes = await fetch('https://api.kaspi.kz/partner/v1/qr/create', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Partner-Token': apiKey
          },
          body: JSON.stringify({
            orderId,
            amount: amountKzt,
            currency: 'KZT',
            comment: `Оплата подписки TenderAI (${effectiveTariffId})`
          })
        });

        if (kaspiRes.ok) {
          const kaspiData = await kaspiRes.json();
          if (kaspiData.qrUrl || kaspiData.qrPayload) {
            qrPayload = kaspiData.qrUrl || kaspiData.qrPayload;
          }
        }
      } catch (err) {
        console.warn('[Kaspi CreateOrder API] Ошибка соединения с API Kaspi Business:', err);
      }
    }

    // Ensure User record exists if userId is provided
    if (auth.userId && auth.userId !== 'demo-user-id') {
      await prisma.user.upsert({
        where: { id: auth.userId },
        update: {},
        create: {
          id: auth.userId,
          email: `${auth.userId}@tenderai.kz`,
          name: 'Пользователь TenderAI'
        }
      }).catch(() => {});
    }

    // Resolve organizationId: from request body (if valid membership) or via user's organization/company profile
    let targetOrgId: string | undefined = undefined;
    if (auth.userId && auth.userId !== 'demo-user-id') {
      if (bodyOrgId) {
        try {
          const isMember = await prisma.organizationMember.findFirst({
            where: { organizationId: bodyOrgId, userId: auth.userId }
          });
          if (isMember) {
            targetOrgId = bodyOrgId;
          }
        } catch {}
      }
      if (!targetOrgId) {
        try {
          const member = await prisma.organizationMember.findFirst({
            where: { userId: auth.userId }
          });
          if (member) {
            targetOrgId = member.organizationId;
          } else {
            const profile = await prisma.companyProfile.findFirst({
              where: { userId: auth.userId }
            });
            if (profile?.organizationId) {
              targetOrgId = profile.organizationId;
            }
          }
        } catch {}
      }
    }

    // Persist Payment record in PostgreSQL DB with PENDING status, userId and organizationId relation
    await prisma.payment.create({
      data: {
        orderId,
        amount: amountKzt,
        tariffPlanId: effectiveTariffId,
        status: 'PENDING',
        userId: auth.userId !== 'demo-user-id' ? auth.userId : undefined,
        organizationId: targetOrgId || undefined
      }
    });

    return NextResponse.json({
      success: true,
      payment: {
        paymentId: orderId,
        qrPayload,
        amountKzt,
        tariffPlanId: effectiveTariffId,
        status: 'PENDING',
        expiresAt: expiresAt.toISOString()
      }
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error?.message || 'Сбой создания заказа' }, { status: 500 });
  }
}
