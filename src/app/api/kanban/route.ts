import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateApiAuth } from '@/lib/security/auth';

export async function GET(request: NextRequest) {
  const auth = validateApiAuth(request);

  try {
    const cards = await prisma.kanbanCard.findMany({
      where: {
        OR: [
          { userId: auth.userId },
          { userId: null }
        ]
      },
      include: { tender: true },
      orderBy: { updatedAt: 'desc' }
    });

    return NextResponse.json({
      success: true,
      isFallback: false,
      cards: cards.map(c => ({
        id: c.id,
        tenderId: c.tenderId,
        stage: c.stage,
        priority: c.priority,
        assignee: c.assignee,
        notes: c.notes,
        tender: c.tender,
        updatedAt: c.updatedAt.toISOString()
      }))
    });
  } catch (error: any) {
    console.warn('[API /api/kanban GET Fallback]:', error?.message);
    return NextResponse.json({ success: true, isFallback: true, cards: [] });
  }
}

export async function POST(request: NextRequest) {
  const auth = validateApiAuth(request);
  if (!auth.authorized && auth.response) return auth.response;

  try {
    const body = await request.json();
    const { id, tenderId, stage, priority, assignee, notes } = body;

    let card;
    if (id && !id.startsWith('kanban-')) {
      card = await prisma.kanbanCard.update({
        where: { id },
        data: { stage, priority, assignee, notes, userId: auth.userId },
        include: { tender: true }
      });
    } else {
      card = await prisma.kanbanCard.create({
        data: {
          tenderId,
          stage: stage || 'UNDER_REVIEW',
          priority: priority || 'MEDIUM',
          assignee,
          notes,
          userId: auth.userId
        },
        include: { tender: true }
      });
    }

    return NextResponse.json({ success: true, card });
  } catch (error: any) {
    console.error('[API /api/kanban POST Error]:', error?.message);
    return NextResponse.json(
      { success: false, isFallback: false, message: error?.message || 'Ошибка сохранения карточки в БД' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const auth = validateApiAuth(request);
  if (!auth.authorized && auth.response) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (id && !id.startsWith('kanban-')) {
      await prisma.kanbanCard.delete({ where: { id } });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[API /api/kanban DELETE Error]:', error?.message);
    return NextResponse.json(
      { success: false, isFallback: false, message: error?.message || 'Ошибка удаления карточки из БД' },
      { status: 500 }
    );
  }
}
