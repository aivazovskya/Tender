import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateApiAuth } from '@/lib/security/auth';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = validateApiAuth(request);
  if (!auth.authorized && auth.response) return auth.response;

  const id = params.id;

  try {
    const existing = await prisma.securityInstrument.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ success: false, message: 'Запись обеспечения не найдена' }, { status: 404 });
    }

    const body = await request.json();
    const { status, releasedAt, documentUrl, issuedByBank, amount, expiryDate } = body;

    const updateData: any = {};

    if (status) {
      updateData.status = status;
      if (status === 'RELEASED' && !existing.releasedAt) {
        updateData.releasedAt = releasedAt ? new Date(releasedAt) : new Date();
      }
    }

    if (releasedAt !== undefined) {
      updateData.releasedAt = releasedAt ? new Date(releasedAt) : null;
    }

    if (documentUrl !== undefined) {
      updateData.documentUrl = documentUrl;
    }

    if (issuedByBank !== undefined) {
      updateData.issuedByBank = issuedByBank;
    }

    if (amount !== undefined) {
      updateData.amount = Number(amount);
    }

    if (expiryDate !== undefined) {
      updateData.expiryDate = new Date(expiryDate);
    }

    const updated = await prisma.securityInstrument.update({
      where: { id },
      data: updateData,
      include: {
        tender: {
          select: { title: true, externalId: true }
        }
      }
    });

    return NextResponse.json({
      success: true,
      instrument: {
        ...updated,
        amount: Number(updated.amount)
      }
    });
  } catch (error: any) {
    console.error('[API /api/security-instruments/[id] PATCH Error]:', error?.message);
    return NextResponse.json(
      { success: false, message: error?.message || 'Ошибка обновления обеспечения' },
      { status: 500 }
    );
  }
}
