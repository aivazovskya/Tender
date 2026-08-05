import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateApiAuth } from '@/lib/security/auth';

export async function GET(request: NextRequest) {
  const auth = await validateApiAuth(request);

  try {
    const cards = await prisma.kanbanCard.findMany({
      where: { userId: auth.userId },
      include: {
        tender: {
          include: {
            requirements: { select: { isCompleted: true } }
          }
        }
      },
      orderBy: { updatedAt: 'desc' }
    });

    return NextResponse.json({
      success: true,
      isFallback: false,
      cards: cards.map(c => {
        const reqList = c.tender?.requirements || [];
        let reqTotal = reqList.length;
        let reqCompleted = reqList.filter(r => r.isCompleted).length;
        if (reqTotal === 0 && c.tender?.aiKeyRequirements && (c.tender.aiKeyRequirements as string[]).length > 0) {
          reqTotal = (c.tender.aiKeyRequirements as string[]).filter((r: string) => r && r.trim().length > 0).length;
        }

        const { requirements, ...tenderWithoutReqs } = (c.tender || {}) as any;

        return {
          id: c.id,
          tenderId: c.tenderId,
          stage: c.stage,
          priority: c.priority,
          assignee: c.assignee,
          notes: c.notes,
          stageEnteredAt: c.stageEnteredAt ? c.stageEnteredAt.toISOString() : undefined,
          stageSlaHours: c.stageSlaHours ?? undefined,
          tender: tenderWithoutReqs,
          requirementsStats: { completed: reqCompleted, total: reqTotal },
          updatedAt: c.updatedAt.toISOString()
        };
      })
    });
  } catch (error: any) {
    console.error('[API /api/kanban GET Error]:', error?.message);
    return NextResponse.json(
      { success: false, isFallback: false, message: error?.message || 'Ошибка загрузки карточек воронки из БД' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await validateApiAuth(request);
  if (!auth.authorized && auth.response) return auth.response;

  try {
    const body = await request.json();
    const { id, tenderId, stage, priority, assignee, notes, stageSlaHours } = body;

    if (!tenderId && !id) {
      return NextResponse.json({ success: false, message: 'Укажите tenderId или id карточки' }, { status: 400 });
    }

    let card;
    if (id && !id.startsWith('temp-') && !id.startsWith('kanban-')) {
      const existing = await prisma.kanbanCard.findUnique({ where: { id } });
      if (!existing) {
        return NextResponse.json({ success: false, message: 'Карточка не найдена' }, { status: 404 });
      }
      if (!existing || existing.userId !== auth.userId) {
        return NextResponse.json(
          { success: false, message: 'Forbidden: Нет прав на редактирование чужой карточки' },
          { status: 403 }
        );
      }
      const stageChanged = stage && stage !== existing.stage;
      card = await prisma.kanbanCard.update({
        where: { id },
        data: {
          stage,
          priority,
          assignee,
          notes,
          stageSlaHours,
          ...(stageChanged ? { stageEnteredAt: new Date() } : {})
        },
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
          stageSlaHours,
          stageEnteredAt: new Date(),
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
  const auth = await validateApiAuth(request);
  if (!auth.authorized && auth.response) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, message: 'Укажите ID карточки для удаления' }, { status: 400 });
    }

    if (!id.startsWith('temp-') && !id.startsWith('kanban-')) {
      const existing = await prisma.kanbanCard.findUnique({ where: { id } });
      if (!existing || existing.userId !== auth.userId) {
        return NextResponse.json(
          { success: false, message: 'Forbidden: Нет прав на удаление чужой карточки' },
          { status: 403 }
        );
      }
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
