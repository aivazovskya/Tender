import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const orderId = searchParams.get('orderId') || searchParams.get('paymentId');

  if (!orderId) {
    return NextResponse.json(
      { success: false, error: 'Missing required parameter orderId' },
      { status: 400 }
    );
  }

  try {
    const payment = await prisma.payment.findUnique({
      where: { orderId }
    });

    if (!payment) {
      return NextResponse.json({
        success: true,
        orderId,
        status: 'PENDING',
        message: 'Order created, awaiting Kaspi Pay webhook notification'
      });
    }

    return NextResponse.json({
      success: true,
      orderId: payment.orderId,
      status: payment.status,
      amount: payment.amount,
      confirmedAt: payment.confirmedAt
    });

  } catch (error: any) {
    return NextResponse.json({
      success: false,
      status: 'UNKNOWN',
      error: error.message || 'Database status lookup error'
    }, { status: 500 });
  }
}
