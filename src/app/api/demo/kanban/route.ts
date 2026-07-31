import { NextRequest, NextResponse } from 'next/server';
import { INITIAL_TENDERS } from '@/lib/mockData';

// Demo in-memory store for guest kanban cards per session
const demoSessionCards: Record<string, any[]> = {};

function getInitialDemoCards(sessionId: string) {
  if (!demoSessionCards[sessionId]) {
    demoSessionCards[sessionId] = [
      {
        id: 'demo-card-1',
        tenderId: INITIAL_TENDERS[0].id,
        stage: 'UNDER_REVIEW',
        priority: 'HIGH',
        assignee: 'Серик А. (Главный тендерщик)',
        notes: 'Демо-карточка лота',
        stageEnteredAt: new Date().toISOString(),
        stageSlaHours: 24,
        tender: INITIAL_TENDERS[0],
        updatedAt: new Date().toISOString()
      },
      {
        id: 'demo-card-2',
        tenderId: INITIAL_TENDERS[1].id,
        stage: 'PREPARING_BID',
        priority: 'MEDIUM',
        assignee: 'Гульнара К. (Юрист)',
        notes: 'Подготовка ТЗ для демо',
        stageEnteredAt: new Date().toISOString(),
        stageSlaHours: 72,
        tender: INITIAL_TENDERS[1],
        updatedAt: new Date().toISOString()
      }
    ];
  }
  return demoSessionCards[sessionId];
}

export async function GET(request: NextRequest) {
  const sessionId = request.headers.get('x-session-id') || 'demo-session';
  const cards = getInitialDemoCards(sessionId);
  return NextResponse.json({
    success: true,
    isDemo: true,
    cards
  });
}

export async function POST(request: NextRequest) {
  const sessionId = request.headers.get('x-session-id') || 'demo-session';
  const cards = getInitialDemoCards(sessionId);
  const body = await request.json();

  const { id, tenderId, stage, priority, assignee, notes } = body;

  let card;
  if (id) {
    const idx = cards.findIndex(c => c.id === id);
    if (idx !== -1) {
      cards[idx] = {
        ...cards[idx],
        stage: stage || cards[idx].stage,
        priority: priority || cards[idx].priority,
        assignee: assignee !== undefined ? assignee : cards[idx].assignee,
        notes: notes !== undefined ? notes : cards[idx].notes,
        stageEnteredAt: stage && stage !== cards[idx].stage ? new Date().toISOString() : cards[idx].stageEnteredAt,
        updatedAt: new Date().toISOString()
      };
      card = cards[idx];
    }
  }

  if (!card && tenderId) {
    const targetTender = INITIAL_TENDERS.find(t => t.id === tenderId) || INITIAL_TENDERS[0];
    card = {
      id: `demo-card-${Date.now()}`,
      tenderId,
      stage: stage || 'UNDER_REVIEW',
      priority: priority || 'MEDIUM',
      assignee: assignee || 'Не назначен',
      notes: notes || '',
      stageEnteredAt: new Date().toISOString(),
      stageSlaHours: 24,
      tender: targetTender,
      updatedAt: new Date().toISOString()
    };
    cards.push(card);
  }

  return NextResponse.json({
    success: true,
    isDemo: true,
    card,
    message: '[Демо-режим] Изменения в воронке применены локально'
  });
}

export async function DELETE(request: NextRequest) {
  const sessionId = request.headers.get('x-session-id') || 'demo-session';
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (id && demoSessionCards[sessionId]) {
    demoSessionCards[sessionId] = demoSessionCards[sessionId].filter(c => c.id !== id);
  }

  return NextResponse.json({
    success: true,
    isDemo: true,
    message: '[Демо-режим] Лот удален из публичной воронки'
  });
}
