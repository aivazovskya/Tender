import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateApiAuth } from '@/lib/security/auth';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await validateApiAuth(request);
  const tenderId = params.id;

  if (!tenderId) {
    return NextResponse.json({ success: false, message: 'ID тендера не указан' }, { status: 400 });
  }

  try {
    const tender = await prisma.tender.findUnique({
      where: { id: tenderId },
      include: { requirements: { orderBy: { createdAt: 'asc' } } }
    });

    if (!tender) {
      return NextResponse.json({ success: false, message: 'Тендер не найден' }, { status: 404 });
    }

    let requirements = tender.requirements;

    // Auto-create requirements from aiKeyRequirements on first access if empty
    if (requirements.length === 0 && tender.aiKeyRequirements && tender.aiKeyRequirements.length > 0) {
      const itemsToCreate = tender.aiKeyRequirements
        .filter(req => req && req.trim().length > 0)
        .map(req => ({
          tenderId,
          label: req.trim(),
          isCompleted: false,
          sourceType: 'AI_EXTRACTED' as const
        }));

      if (itemsToCreate.length > 0) {
        await prisma.tenderRequirementItem.createMany({
          data: itemsToCreate
        });

        requirements = await prisma.tenderRequirementItem.findMany({
          where: { tenderId },
          orderBy: { createdAt: 'asc' }
        });
      }
    }

    const totalCount = requirements.length;
    const completedCount = requirements.filter(r => r.isCompleted).length;
    const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

    return NextResponse.json({
      success: true,
      requirements,
      stats: {
        totalCount,
        completedCount,
        progressPct
      }
    });
  } catch (error: any) {
    console.error('[API /api/tenders/[id]/requirements GET Error]:', error?.message);
    return NextResponse.json(
      { success: false, message: error?.message || 'Ошибка загрузки требований' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await validateApiAuth(request);
  if (!auth.authorized && auth.response) return auth.response;

  const tenderId = params.id;
  if (!tenderId) {
    return NextResponse.json({ success: false, message: 'ID тендера не указан' }, { status: 400 });
  }

  try {
    const body = await request.json();
    const { label, notes } = body;

    if (!label || !label.trim()) {
      return NextResponse.json({ success: false, message: 'Укажите текст требования' }, { status: 400 });
    }

    const newItem = await prisma.tenderRequirementItem.create({
      data: {
        tenderId,
        label: label.trim(),
        notes: notes ? notes.trim() : null,
        sourceType: 'MANUAL',
        isCompleted: false
      }
    });

    return NextResponse.json({ success: true, item: newItem });
  } catch (error: any) {
    console.error('[API /api/tenders/[id]/requirements POST Error]:', error?.message);
    return NextResponse.json(
      { success: false, message: error?.message || 'Ошибка добавления требования' },
      { status: 500 }
    );
  }
}
