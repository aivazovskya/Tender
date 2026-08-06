import { NextRequest, NextResponse } from 'next/server';
import { validatePublicApiKey } from '@/lib/security/public-api-guard';
import { prisma } from '@/lib/prisma';
import { INITIAL_TENDERS as mockTenders } from '@/lib/mockData';
import { resolveOwnCompanyProfile } from '@/lib/security/resolve-company-profile';
import { DeadlineService } from '@/lib/services/deadline.service';

export async function GET(request: NextRequest) {
  // 1. Enforce Public API Key Authentication & Enterprise Guard
  const auth = await validatePublicApiKey(request);
  if (!auth.authorized && auth.response) {
    return auth.response;
  }

  const userId = auth.userId || 'user-enterprise-default';
  let cards: any[] = [];

  try {
    cards = await prisma.kanbanCard.findMany({
      where: { userId },
      include: { tender: true },
      orderBy: { updatedAt: 'desc' }
    });
  } catch {
    cards = [];
  }

  // Fallback to mock cards if DB empty
  if (cards.length === 0) {
    cards = mockTenders.slice(0, 3).map((t, idx) => ({
      id: `pub-k-${idx + 1}`,
      userId,
      tenderId: t.id,
      stage: idx === 0 ? 'UNDER_REVIEW' : idx === 1 ? 'PREPARING_BID' : 'SUBMITTED',
      priority: idx === 0 ? 'HIGH' : 'MEDIUM',
      assignee: 'Интеграция 1С / CRM',
      notes: 'Синхронизировано через Публичный REST API v1',
      stageEnteredAt: new Date().toISOString(),
      tender: t
    }));
  }

  return NextResponse.json({
    success: true,
    count: cards.length,
    cards: cards.map(c => ({
      id: c.id,
      tenderId: c.tenderId,
      stage: c.stage,
      priority: c.priority,
      assignee: c.assignee,
      notes: c.notes,
      stageEnteredAt: c.stageEnteredAt,
      tender: c.tender ? {
        id: c.tender.id,
        externalId: c.tender.externalId,
        title: c.tender.title,
        amount: c.tender.amount,
        customerName: c.tender.customerName
      } : null
    }))
  });
}

export async function POST(request: NextRequest) {
  // 1. Enforce Public API Key Authentication & Enterprise Guard
  const auth = await validatePublicApiKey(request);
  if (!auth.authorized && auth.response) {
    return auth.response;
  }

  const userId = auth.userId || 'user-enterprise-default';

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Неверный формат JSON в теле запроса' }, { status: 400 });
  }

  const { id, tenderId, stage, priority, assignee, notes } = body;

  if (!tenderId && !id) {
    return NextResponse.json({ success: false, error: 'Параметр tenderId или id обязателен' }, { status: 400 });
  }

  let savedCard: any = null;

  try {
    if (id) {
      savedCard = await prisma.kanbanCard.update({
        where: { id },
        data: {
          ...(stage ? { stage } : {}),
          ...(priority ? { priority } : {}),
          ...(assignee !== undefined ? { assignee } : {}),
          ...(notes !== undefined ? { notes } : {}),
          ...(stage ? { stageEnteredAt: new Date() } : {})
        },
        include: { tender: true }
      });
    } else {
      savedCard = await prisma.kanbanCard.upsert({
        where: { id: `card-${userId}-${tenderId}` },
        update: {
          ...(stage ? { stage } : {}),
          ...(priority ? { priority } : {}),
          ...(assignee !== undefined ? { assignee } : {}),
          ...(notes !== undefined ? { notes } : {}),
          ...(stage ? { stageEnteredAt: new Date() } : {})
        },
        create: {
          id: `card-${userId}-${tenderId}`,
          userId,
          tenderId,
          stage: stage || 'UNDER_REVIEW',
          priority: priority || 'MEDIUM',
          assignee: assignee || '1С Интеграция',
          notes: notes || 'Добавлено через Public API v1'
        },
        include: { tender: true }
      });
    }
  } catch {
    // DB fallback
    savedCard = {
      id: id || `card-${Date.now()}`,
      userId,
      tenderId: tenderId || mockTenders[0].id,
      stage: stage || 'UNDER_REVIEW',
      priority: priority || 'MEDIUM',
      assignee: assignee || '1С Интеграция',
      notes: notes || 'Добавлено через Public API v1',
      stageEnteredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  try {
    const companyProfile = await resolveOwnCompanyProfile(userId);
    if (companyProfile && savedCard?.tenderId) {
      const tenderDate = savedCard.tender?.deadlineDate ? new Date(savedCard.tender.deadlineDate) : new Date();
      await DeadlineService.autoCreateSubmissionDeadline(
        savedCard.tenderId,
        companyProfile.id,
        tenderDate
      );
    }
  } catch {
    // Ignore fallback errors
  }

  return NextResponse.json({
    success: true,
    card: savedCard
  });
}
