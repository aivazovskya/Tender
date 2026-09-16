import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';

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
    const { orderId, kaspiTransactionId, status, amount } = payload;

    if (!orderId || !kaspiTransactionId || status !== 'SUCCESS') {
      return NextResponse.json(
        { success: false, error: 'Invalid payload structure or status not SUCCESS' },
        { status: 400 }
      );
    }

    // 4. The order MUST have been created by our own /api/billing/kaspi/create-order
    // endpoint first. Never activate a subscription for an orderId we don't
    // recognize — there would be no reliable, server-verified way to know
    // which account should receive it, or what was actually agreed/priced.
    const existingPayment = await prisma.payment.findUnique({
      where: { orderId }
    });

    if (!existingPayment) {
      console.error(`[SECURITY ALERT] Kaspi webhook for unknown orderId #${orderId} — no matching order was created via /api/billing/kaspi/create-order. Rejecting.`);
      return NextResponse.json(
        { success: false, error: 'Unknown order: no matching order was created for this orderId' },
        { status: 404 }
      );
    }

    if (existingPayment.status === 'PAID') {
      console.log(`[Kaspi Webhook] Idempotent hit for already processed transaction: ${kaspiTransactionId}`);
      return NextResponse.json({
        success: true,
        message: 'Transaction already processed (Idempotent OK)',
        status: 'PAID'
      });
    }

    // 5. Price tampering check (Bug #8 defense in depth): the paid amount must
    // cover what was actually priced and recorded at order-creation time.
    const paidAmount = parseFloat(amount) || 0;
    if (paidAmount < existingPayment.amount) {
      console.error(`[SECURITY ALERT] Kaspi webhook paid amount (${paidAmount} KZT) is less than order price (${existingPayment.amount} KZT) for Order #${orderId}`);
      return NextResponse.json(
        { success: false, error: 'Payment amount mismatch: Paid amount is less than required order amount' },
        { status: 400 }
      );
    }

    // 6. Atomic Update in Database
    const nextExpiration = new Date();
    nextExpiration.setDate(nextExpiration.getDate() + 30); // +30 days subscription
    // Trust only what was recorded server-side when the order was created —
    // never the webhook payload's own tariffPlanId (that field is not
    // verified against anything and would let a signed-but-uncontrolled
    // payload activate a higher tier than was actually priced/paid for).
    const effectivePlanId = existingPayment.tariffPlanId || 'PRO';
    const associatedUserId = existingPayment.userId;
    const associatedOrgId = existingPayment.organizationId;

    const txOps: any[] = [
      prisma.payment.upsert({
        where: { orderId },
        update: {
          kaspiTransactionId,
          status: 'PAID',
          amount: paidAmount,
          tariffPlanId: effectivePlanId,
          rawWebhookPayload: rawBody,
          confirmedAt: new Date()
        },
        create: {
          orderId,
          kaspiTransactionId,
          status: 'PAID',
          amount: paidAmount,
          tariffPlanId: effectivePlanId,
          rawWebhookPayload: rawBody,
          confirmedAt: new Date()
        }
      })
    ];

    // Activate subscription by userId if linked to the order
    if (associatedUserId) {
      txOps.push(
        prisma.companyProfile.updateMany({
          where: { userId: associatedUserId },
          data: {
            subscriptionPlan: effectivePlanId,
            subscriptionExpiresAt: nextExpiration
          }
        })
      );
    }

    // Activate subscription by organizationId if linked
    if (associatedOrgId) {
      txOps.push(
        prisma.organization.updateMany({
          where: { id: associatedOrgId },
          data: {
            subscriptionPlan: effectivePlanId,
            subscriptionExpiresAt: nextExpiration
          }
        }),
        prisma.companyProfile.updateMany({
          where: { organizationId: associatedOrgId },
          data: {
            subscriptionPlan: effectivePlanId,
            subscriptionExpiresAt: nextExpiration
          }
        })
      );
    }

    // Note: subscriptions are activated only via the userId/organizationId
    // recorded on the order at creation time (see above) — never via a `bin`
    // field taken from the webhook payload. That field is not verified
    // against who created or paid for the order, and would let anyone who
    // can complete a Kaspi payment (for any order they control) activate a
    // subscription on a company they have no relationship with, just by
    // guessing/knowing its BIN.

    await prisma.$transaction(txOps);

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
