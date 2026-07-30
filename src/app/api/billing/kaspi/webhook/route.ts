import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { TARIFF_PLANS } from '@/lib/services/kaspi.service';

/**
 * Helper to safely verify Kaspi Pay HMAC-SHA256 signature
 */
function verifyKaspiSignature(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader || !secret) return false;
  try {
    const expected = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');

    const expectedBuffer = Buffer.from(expected, 'utf-8');
    const signatureBuffer = Buffer.from(signatureHeader, 'utf-8');

    if (expectedBuffer.length !== signatureBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
  } catch (e) {
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    const signatureHeader = req.headers.get('x-kaspi-signature') || req.headers.get('X-Kaspi-Signature');
    const secret = process.env.KASPI_WEBHOOK_SECRET;

    // Strict security check: Do not allow unconfigured or default webhook secrets
    if (!secret || secret.trim().length === 0 || secret.includes('your_') || secret === 'kaspi_hmac_secret_key_change_in_production') {
      console.error('[SECURITY FATAL] KASPI_WEBHOOK_SECRET is missing, empty, or configured with a default/placeholder secret.');
      return NextResponse.json(
        { success: false, error: 'Server misconfiguration: Webhook secret missing or insecure' },
        { status: 500 }
      );
    }

    // 1. Read Raw Body BEFORE any JSON parsing (HMAC is computed over exact raw bytes)
    const rawBody = await req.text();

    // 2. Strict HMAC Verification
    const isValidSignature = verifyKaspiSignature(rawBody, signatureHeader, secret);
    if (!isValidSignature) {
      console.warn(`[SECURITY ALERT] Invalid Kaspi webhook signature attempt from IP ${req.ip || 'unknown'}`);
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Invalid cryptographic signature' },
        { status: 401 }
      );
    }

    // 3. Safe JSON Parse after cryptographic validation
    const payload = JSON.parse(rawBody);
    const { orderId, kaspiTransactionId, status, amount, tariffPlanId, bin } = payload;

    if (!orderId || !kaspiTransactionId || status !== 'SUCCESS') {
      return NextResponse.json(
        { success: false, error: 'Invalid payload structure or status not SUCCESS' },
        { status: 400 }
      );
    }

    // 4. Check existing payment & price tampering (Bug #8 defense in depth)
    const paidAmount = parseFloat(amount) || 0;
    const targetPlan = TARIFF_PLANS.find(p => p.id === (tariffPlanId || 'PRO'));
    const expectedMinAmount = targetPlan ? targetPlan.priceKztMonth : 0;

    const existingPayment = await prisma.payment.findUnique({
      where: { orderId }
    });

    if (existingPayment) {
      if (existingPayment.status === 'PAID') {
        console.log(`[Kaspi Webhook] Idempotent hit for already processed transaction: ${kaspiTransactionId}`);
        return NextResponse.json({
          success: true,
          message: 'Transaction already processed (Idempotent OK)',
          status: 'PAID'
        });
      }
      // Security check: ensure paid amount is not less than the original order price
      if (paidAmount < existingPayment.amount) {
        console.error(`[SECURITY ALERT] Kaspi webhook paid amount (${paidAmount} KZT) is less than order price (${existingPayment.amount} KZT) for Order #${orderId}`);
        return NextResponse.json(
          { success: false, error: 'Payment amount mismatch: Paid amount is less than required order amount' },
          { status: 400 }
        );
      }
    } else if (expectedMinAmount > 0 && paidAmount < expectedMinAmount) {
      console.error(`[SECURITY ALERT] Kaspi webhook paid amount (${paidAmount} KZT) is less than plan price (${expectedMinAmount} KZT) for Tariff ${tariffPlanId}`);
      return NextResponse.json(
        { success: false, error: 'Payment amount mismatch: Paid amount is less than tariff price' },
        { status: 400 }
      );
    }

    // 5. Atomic Update in Database
    const nextExpiration = new Date();
    nextExpiration.setDate(nextExpiration.getDate() + 30); // +30 days subscription

    await prisma.$transaction([
      prisma.payment.upsert({
        where: { orderId },
        update: {
          kaspiTransactionId,
          status: 'PAID',
          amount: paidAmount,
          tariffPlanId: tariffPlanId || 'PRO',
          rawWebhookPayload: rawBody,
          confirmedAt: new Date()
        },
        create: {
          orderId,
          kaspiTransactionId,
          status: 'PAID',
          amount: paidAmount,
          tariffPlanId: tariffPlanId || 'PRO',
          rawWebhookPayload: rawBody,
          confirmedAt: new Date()
        }
      }),
      ...(bin ? [
        prisma.companyProfile.updateMany({
          where: { bin },
          data: {
            subscriptionPlan: tariffPlanId || 'PRO',
            subscriptionExpiresAt: nextExpiration
          }
        })
      ] : [])
    ]);

    console.log(`✅ [Kaspi Pay Webhook] Payment verified & activated for Order #${orderId}`);

    return NextResponse.json({
      success: true,
      message: 'Subscription successfully activated via Kaspi Pay Webhook',
      status: 'PAID'
    });

  } catch (error: any) {
    console.error('[Kaspi Webhook Error]:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
