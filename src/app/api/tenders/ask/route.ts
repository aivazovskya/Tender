import { NextRequest, NextResponse } from 'next/server';
import { validateApiAuth } from '@/lib/security/auth';
import { prisma } from '@/lib/prisma';
import { AIService } from '@/lib/services/ai.service';

export async function POST(request: NextRequest) {
  try {
    const auth = validateApiAuth(request);
    if (!auth.authorized && auth.response) {
      return auth.response;
    }

    const body = await request.json();
    const { tenderId, externalId, question, lang } = body;

    if (!question || typeof question !== 'string' || !question.trim()) {
      return NextResponse.json(
        { success: false, error: 'Поле question обязательно' },
        { status: 400 }
      );
    }

    if (!tenderId && !externalId) {
      return NextResponse.json(
        { success: false, error: 'Укажите tenderId или externalId' },
        { status: 400 }
      );
    }

    // Try finding tender in database
    let tender: any = null;
    try {
      tender = await prisma.tender.findFirst({
        where: {
          OR: [
            ...(tenderId ? [{ id: tenderId }] : []),
            ...(externalId ? [{ externalId: String(externalId) }] : [])
          ]
        },
        include: {
          documents: true
        }
      });
    } catch (dbErr) {
      console.warn('[API /api/tenders/ask] БД недоступна:', dbErr);
    }

    // Fallback tender object if DB record not found or DB offline
    if (!tender) {
      tender = {
        id: tenderId || 'demo-id',
        externalId: externalId || 'demo-external-id',
        title: body.title || 'Тендер',
        customerName: body.customerName || 'Заказчик',
        amount: body.amount || 0,
        region: body.region || 'Казахстан',
        deadlineDate: body.deadlineDate || new Date().toISOString(),
        source: body.source || 'GOSZAKUP',
        documents: []
      };
    }

    let documentText = body.documentText || '';
    if (!documentText && Array.isArray(tender.documents)) {
      const docWithText = tender.documents.find((d: any) => d.extractedText && d.extractedText.trim().length > 0);
      if (docWithText) {
        documentText = docWithText.extractedText;
      }
    }

    const answer = await AIService.answerRAGQuestion(tender, question.trim(), documentText, lang);

    return NextResponse.json({
      success: true,
      answer,
      userId: auth.userId
    });
  } catch (error: any) {
    console.error('[API /api/tenders/ask ERROR]:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Внутренняя ошибка сервера' },
      { status: 500 }
    );
  }
}
