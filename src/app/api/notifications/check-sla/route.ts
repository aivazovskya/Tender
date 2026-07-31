import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { TelegramBotService } from '@/lib/services/telegram.service';
import { KanbanStage } from '@/lib/types/tender';

const DEFAULT_STAGE_SLA_HOURS: Record<KanbanStage, number> = {
  UNDER_REVIEW: 24,
  PREPARING_BID: 72,
  SUBMITTED: 0,
  WON: 0,
  LOST: 0
};

// In-memory idempotency cache for notified cards (cardId:type => timestamp)
const notifiedCache = new Map<string, number>();

export async function GET(request: NextRequest) {
  try {
    const cards = await prisma.kanbanCard.findMany({
      where: {
        stage: { in: ['UNDER_REVIEW', 'PREPARING_BID'] }
      },
      include: {
        tender: true,
        user: {
          include: {
            companyProfile: true
          }
        }
      }
    });

    const now = Date.now();
    const twentyFourHoursMs = 24 * 60 * 60 * 1000;
    const notificationsSent: any[] = [];

    for (const card of cards) {
      const slaLimitHours = card.stageSlaHours ?? DEFAULT_STAGE_SLA_HOURS[card.stage] ?? 0;
      const enteredAtMs = card.stageEnteredAt ? new Date(card.stageEnteredAt).getTime() : new Date(card.updatedAt).getTime();
      const hoursOnStage = Math.floor((now - enteredAtMs) / (1000 * 60 * 60));
      const isSlaOverdue = slaLimitHours > 0 && hoursOnStage > slaLimitHours;

      const deadlineMs = new Date(card.tender.deadlineDate).getTime();
      const hoursToDeadline = (deadlineMs - now) / (1000 * 60 * 60);
      const isUrgentDeadline = hoursToDeadline > 0 && hoursToDeadline < 24;

      const telegramChatId = card.user?.companyProfile?.telegramChatId;

      // 1. Process Overdue SLA notification
      if (isSlaOverdue) {
        const cacheKey = `sla:${card.id}`;
        const lastNotified = notifiedCache.get(cacheKey) || 0;
        if (now - lastNotified > twentyFourHoursMs) {
          notifiedCache.set(cacheKey, now);
          const msg = `⚠️ <b>SLA просрочен!</b>\nЛот №${card.tender.externalId} ("${card.tender.title}") находится на этапе <b>${card.stage}</b> уже ${hoursOnStage}ч (норма: ${slaLimitHours}ч).`;
          
          if (telegramChatId) {
            TelegramBotService.sendNotification(card.tender as any, telegramChatId);
          }

          notificationsSent.push({
            cardId: card.id,
            type: 'SLA_OVERDUE',
            hoursOnStage,
            slaLimitHours,
            telegramChatId
          });
        }
      }

      // 2. Process Urgent Deadline notification
      if (isUrgentDeadline) {
        const cacheKey = `deadline:${card.id}`;
        const lastNotified = notifiedCache.get(cacheKey) || 0;
        if (now - lastNotified > twentyFourHoursMs) {
          notifiedCache.set(cacheKey, now);
          const msg = `⚡ <b>Срочный дедлайн < 24ч!</b>\nПо лоту №${card.tender.externalId} ("${card.tender.title}") осталось ${Math.ceil(hoursToDeadline)}ч до завершения приема заявок!`;

          if (telegramChatId) {
            TelegramBotService.sendNotification(card.tender as any, telegramChatId);
          }

          notificationsSent.push({
            cardId: card.id,
            type: 'URGENT_DEADLINE',
            hoursToDeadline: Math.ceil(hoursToDeadline),
            telegramChatId
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      processedCardsCount: cards.length,
      notificationsSentCount: notificationsSent.length,
      notificationsSent
    });
  } catch (error: any) {
    console.error('[API /api/notifications/check-sla Error]:', error?.message);
    return NextResponse.json(
      { success: false, error: error?.message || 'Ошибка проверки SLA и дедлайнов' },
      { status: 500 }
    );
  }
}
