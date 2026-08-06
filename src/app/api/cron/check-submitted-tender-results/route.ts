import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { GoszakupApiAdapter } from '@/lib/ingestion/goszakup.adapter';
import { resolveOwnCompanyProfile } from '@/lib/security/resolve-company-profile';
import { TelegramBotService } from '@/lib/services/telegram.service';

export async function GET(request: NextRequest) {
  return handleCronJob(request);
}

export async function POST(request: NextRequest) {
  return handleCronJob(request);
}

async function handleCronJob(request: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      console.error('[Cron] CRON_SECRET is not configured');
      return NextResponse.json(
        { success: false, message: 'Server misconfiguration' },
        { status: 500 }
      );
    }

    const authHeader = request.headers.get('x-cron-secret') || request.headers.get('X-Cron-Secret');
    const { searchParams } = new URL(request.url);
    const secretQuery = searchParams.get('cronSecret') || searchParams.get('secret');
    const providedSecret = authHeader || secretQuery;

    if (!providedSecret || providedSecret !== cronSecret) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized: Invalid X-Cron-Secret header or query secret' },
        { status: 401 }
      );
    }

    // 1. Fetch all KanbanCards currently in SUBMITTED stage
    let submittedCards: any[] = [];
    try {
      submittedCards = await prisma.kanbanCard.findMany({
        where: {
          stage: 'SUBMITTED'
        },
        include: {
          tender: true
        }
      });
    } catch (err: any) {
      console.warn('[Cron /api/cron/check-submitted-tender-results] DB error finding cards:', err?.message);
    }

    const adapter = new GoszakupApiAdapter();
    let wonCount = 0;
    let lostCount = 0;
    let pendingCount = 0;

    for (const card of submittedCards) {
      if (!card.tender || !card.tender.externalId) continue;

      // 2. Resolve CompanyProfile for card (by userId or organizationId)
      let profile: any = null;
      if (card.userId) {
        profile = await resolveOwnCompanyProfile(card.userId);
      }
      if (!profile && card.organizationId) {
        try {
          profile = await prisma.companyProfile.findFirst({
            where: { organizationId: card.organizationId }
          });
        } catch {
          // fallback
        }
      }

      const companyBin = profile?.bin || '123456789012';

      // 3. Fetch results from Goszakup API
      let buyResult: any = null;
      try {
        buyResult = await adapter.fetchBuyResult(card.tender.externalId);
      } catch (err: any) {
        console.warn(`[Cron check-submitted-tender-results] Error fetching buy result for ${card.tender.externalId}:`, err?.message);
      }

      if (!buyResult || !buyResult.isFinished) {
        pendingCount++;
        continue;
      }

      // 4. Determine WON vs LOST
      const isWon = Boolean(buyResult.winnerBin && buyResult.winnerBin === companyBin);
      const newStage = isWon ? 'WON' : 'LOST';
      const finalAmount = buyResult.finalAmount || Number(card.tender.amount || 0);

      // 5. Update KanbanCard status in DB
      try {
        await prisma.kanbanCard.update({
          where: { id: card.id },
          data: {
            stage: newStage,
            stageEnteredAt: new Date(),
            ...(isWon ? { finalWinAmount: finalAmount } : {})
          }
        });
      } catch (dbErr: any) {
        console.warn(`[Cron check-submitted-tender-results] DB error updating card ${card.id}:`, dbErr?.message);
      }

      if (isWon) wonCount++;
      else lostCount++;

      // 6. Send Telegram Notification
      const chatId = profile?.telegramChatId || process.env.TELEGRAM_DEFAULT_CHAT_ID;
      const statusText = isWon ? '🏆 <b>ПОБЕДА!</b>' : '❌ <b>Не выиграно</b>';
      const amountFormatted = Number(finalAmount).toLocaleString('ru-RU');

      const customMessage =
        `🏆 <b>РЕЗУЛЬТАТЫ ЗАКУПКИ</b>\n\n` +
        `📋 Тендер: <b>${card.tender.title}</b>\n` +
        `🏛️ Заказчик: <b>${card.tender.customerName || '—'}</b>\n\n` +
        `Статус заявки: ${statusText}\n` +
        `${isWon ? `💰 Сумма контракта: <b>${amountFormatted} KZT</b>\n` : ''}` +
        `⏳ Дата подведения итогов: ${new Date().toLocaleDateString('ru-RU')}\n\n` +
        `🔗 <a href="${card.tender.sourceUrl || '#'}">Перейти к закупке</a>`;

      try {
        await TelegramBotService.sendNotification(card.tender, chatId, customMessage);
      } catch (tgErr: any) {
        console.warn(`[Cron check-submitted-tender-results] Error sending Telegram alert:`, tgErr?.message);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Проверка результатов поданных заявок успешно выполнена',
      processedCount: submittedCards.length,
      wonCount,
      lostCount,
      pendingCount
    });
  } catch (error: any) {
    console.error('[API /api/cron/check-submitted-tender-results Error]:', error?.message);
    return NextResponse.json(
      { success: false, message: error?.message || 'Ошибка выполнения крон-задачи результатов' },
      { status: 500 }
    );
  }
}
