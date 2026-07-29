import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';


export async function GET() {
  try {
    const cards = await prisma.kanbanCard.findMany({
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
  try {
    const body = await request.json();
    const { id, tenderId, stage, priority, assignee, notes } = body;

    let card;
    if (id && !id.startsWith('kanban-')) {
      card = await prisma.kanbanCard.update({
        where: { id },
        data: { stage, priority, assignee, notes },
        include: { tender: true }
      });
    } else {
      card = await prisma.kanbanCard.create({
        data: {
          tenderId,
          stage: stage || 'UNDER_REVIEW',
          priority: priority || 'MEDIUM',
          assignee,
          notes
        },
        include: { tender: true }
      });
    }

    return NextResponse.json({ success: true, card });
  } catch (error: any) {
    console.warn('[API /api/kanban POST Fallback]:', error?.message);
    return NextResponse.json({ success: true, isFallback: true, message: 'Сохранено локально' });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (id && !id.startsWith('kanban-')) {
      await prisma.kanbanCard.delete({ where: { id } });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: true, isFallback: true });
  }
}
