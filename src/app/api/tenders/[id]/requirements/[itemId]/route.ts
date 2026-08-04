import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateApiAuth } from '@/lib/security/auth';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; itemId: string } }
) {
  const auth = validateApiAuth(request);
  if (!auth.authorized && auth.response) return auth.response;

  const { id: tenderId, itemId } = params;

  try {
    const existing = await prisma.tenderRequirementItem.findUnique({
      where: { id: itemId }
    });

    if (!existing || existing.tenderId !== tenderId) {
      return NextResponse.json({ success: false, message: 'Пункт требований не найден' }, { status: 404 });
    }

    const body = await request.json();
    const { isCompleted, notes, label } = body;

    const updateData: any = {};

    if (typeof isCompleted === 'boolean') {
      updateData.isCompleted = isCompleted;
      if (isCompleted) {
        updateData.completedBy = auth.userId;
        updateData.completedAt = new Date();
      } else {
        updateData.completedBy = null;
        updateData.completedAt = null;
      }
    }

    if (notes !== undefined) {
      updateData.notes = notes ? notes.trim() : null;
    }

    if (label !== undefined && label.trim()) {
      updateData.label = label.trim();
    }

    const updated = await prisma.tenderRequirementItem.update({
      where: { id: itemId },
      data: updateData
    });

    return NextResponse.json({ success: true, item: updated });
  } catch (error: any) {
    console.error('[API /api/tenders/[id]/requirements/[itemId] PATCH Error]:', error?.message);
    return NextResponse.json(
      { success: false, message: error?.message || 'Ошибка обновления требования' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; itemId: string } }
) {
  const auth = validateApiAuth(request);
  if (!auth.authorized && auth.response) return auth.response;

  const { id: tenderId, itemId } = params;

  try {
    const existing = await prisma.tenderRequirementItem.findUnique({
      where: { id: itemId }
    });

    if (!existing || existing.tenderId !== tenderId) {
      return NextResponse.json({ success: false, message: 'Пункт требований не найден' }, { status: 404 });
    }

    // Requirements extracted by AI cannot be deleted, only unchecked
    if (existing.sourceType === 'AI_EXTRACTED') {
      return NextResponse.json(
        { success: false, message: 'Пункты, извлечённые AI, нельзя удалять. Вы можете снять с них отметку.' },
        { status: 400 }
      );
    }

    await prisma.tenderRequirementItem.delete({
      where: { id: itemId }
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[API /api/tenders/[id]/requirements/[itemId] DELETE Error]:', error?.message);
    return NextResponse.json(
      { success: false, message: error?.message || 'Ошибка удаления требования' },
      { status: 500 }
    );
  }
}
