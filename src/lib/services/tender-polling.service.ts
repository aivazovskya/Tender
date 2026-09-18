import { prisma } from '@/lib/prisma';
import { TelegramBotService } from './telegram.service';
import { resolveOwnCompanyProfile } from '../security/resolve-company-profile';
import { TenderStatus, STATUS_LABELS_RU } from '../types/tender';
import { GoszakupApiAdapter } from '../ingestion/goszakup.adapter';
import { TenderCalculationService } from './tender-calculation.service';
import { AntiDumpingService } from './anti-dumping.service';

export interface PollingIntervalRule {
  minHours: number;
  maxHours: number | null;
  intervalMs: number;
  label: string;
}

export const POLLING_RULES = {
  MORE_THAN_7_DAYS: {
    minHours: 7 * 24, // 168h
    maxHours: null,
    intervalMs: 12 * 60 * 60 * 1000, // 12 hours
    label: 'Раз в 12 часов (>7 дней до дедлайна)'
  },
  BETWEEN_1_AND_7_DAYS: {
    minHours: 24,
    maxHours: 7 * 24,
    intervalMs: 2 * 60 * 60 * 1000, // 2 hours
    label: 'Раз в 2 часа (1–7 дней до дедлайна)'
  },
  LESS_THAN_24_HOURS: {
    minHours: 0,
    maxHours: 24,
    intervalMs: 30 * 60 * 1000, // 30 minutes
    label: 'Раз в 30 минут (<24 часов до дедлайна)'
  },
  EXPIRED_OR_POST_DEADLINE: {
    minHours: -Infinity,
    maxHours: 0,
    intervalMs: 60 * 60 * 1000, // 1 hour for post-deadline/results check
    label: 'Раз в 1 час (после наступления дедлайна)'
  }
};

export { STATUS_LABELS_RU };

export interface PollTenderResult {
  tenderId: string;
  polled: boolean;
  statusChanged: boolean;
  deadlineChanged: boolean;
  priceChanged?: boolean;
  previousStatus?: string;
  newStatus?: string;
  previousPrice?: number;
  newPrice?: number;
  redZoneCalculations?: number;
  dumpingSeverity?: string | null;
  notificationsSent: number;
  error?: string;
}

export interface BatchPollingSummary {
  timestamp: string;
  totalActiveCards: number;
  uniqueTenders: number;
  polledTenders: number;
  skippedTenders: number;
  statusChanges: number;
  deadlineChanges: number;
  priceChanges: number;
  notificationsSent: number;
  results: PollTenderResult[];
}

export class TenderPollingService {
  /**
   * Computes required polling interval in ms based on time remaining until tender deadline.
   * Specification §10.2 / §3:
   * - > 7 days: 12 hours
   * - 1 - 7 days: 2 hours
   * - < 24 hours: 30 minutes
   */
  static getPollingIntervalMs(deadlineDate: Date | string, now: Date = new Date()): number {
    const deadline = new Date(deadlineDate);
    const hoursRemaining = (deadline.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (hoursRemaining > POLLING_RULES.MORE_THAN_7_DAYS.minHours) {
      return POLLING_RULES.MORE_THAN_7_DAYS.intervalMs;
    }
    if (hoursRemaining >= POLLING_RULES.BETWEEN_1_AND_7_DAYS.minHours) {
      return POLLING_RULES.BETWEEN_1_AND_7_DAYS.intervalMs;
    }
    if (hoursRemaining > 0) {
      return POLLING_RULES.LESS_THAN_24_HOURS.intervalMs;
    }
    return POLLING_RULES.EXPIRED_OR_POST_DEADLINE.intervalMs;
  }

  /**
   * Determines if a tender is due for its next poll based on its lastPolledAt and deadline
   */
  static isDueForPolling(
    tender: { deadlineDate: Date | string; lastPolledAt?: Date | string | null },
    now: Date = new Date()
  ): boolean {
    if (!tender.lastPolledAt) {
      return true;
    }
    const lastPolled = new Date(tender.lastPolledAt).getTime();
    const intervalMs = this.getPollingIntervalMs(tender.deadlineDate, now);
    return (now.getTime() - lastPolled) >= intervalMs;
  }

  /**
   * Maps source status codes (Goszakup / Samruk / etc.) to unified TenderStatus enum
   */
  static mapSourceStatusToTenderStatus(rawStatus: string, currentStatus?: string): TenderStatus {
    const s = String(rawStatus || '').toUpperCase().trim();
    if (!s) return (currentStatus as TenderStatus) || 'ACTIVE';

    if (s === '350' || s === '400' || s === 'FINISHED' || s.includes('ЗАВЕРШ')) {
      return 'FINISHED';
    }
    if (s === '320' || s.includes('РАССМОТР') || s === 'APPLICATIONS_REVIEW') {
      return 'APPLICATIONS_REVIEW';
    }
    if (s === '330' || s.includes('ВСКРЫТ') || s === 'PRICE_PROPOSALS_OPENED') {
      return 'PRICE_PROPOSALS_OPENED';
    }
    if (s.includes('АУКЦИОН') || s.includes('ТОРГ') || s === 'AUCTION_IN_PROGRESS') {
      return 'AUCTION_IN_PROGRESS';
    }
    if (s.includes('ИТОГ') || s === 'SUMMARIZING') {
      return 'SUMMARIZING';
    }
    if (s === 'PUBLISHED' || s.includes('ОПУБЛИК')) {
      return 'PUBLISHED';
    }
    if (s.includes('ПРИЕМ') || s.includes('ПРИЁМ') || s === 'ACCEPTING_BIDS') {
      return 'ACCEPTING_BIDS';
    }
    if (s === '500' || s.includes('ОТМЕН') || s === 'CANCELLED') {
      return 'CANCELLED';
    }
    if (s.includes('ПРИОСТАНОВ') || s === 'SUSPENDED') {
      return 'SUSPENDED';
    }
    if (s.includes('НЕ СОСТОЯЛСЯ') || s === 'FAILED') {
      return 'FAILED';
    }

    // Default: keep current status or map known strings
    return (currentStatus as TenderStatus) || 'ACTIVE';
  }

  /**
   * Polls an individual tender by ID, detects status changes, deadline shifts,
   * creates TenderStatusEvent records and delivers Telegram notifications.
   */
  static async pollTender(
    tenderId: string,
    options?: { force?: boolean; mockSourceData?: any; now?: Date }
  ): Promise<PollTenderResult> {
    const now = options?.now || new Date();

    let tender: any = null;
    try {
      tender = await prisma.tender.findUnique({
        where: { id: tenderId },
        include: {
          kanbanCards: true,
          deadlines: true,
          statusEvents: {
            orderBy: { changedAt: 'desc' },
            take: 5
          }
        }
      });
    } catch (err: any) {
      console.warn(`[TenderPollingService] DB lookup failed for tender ${tenderId}:`, err?.message);
    }

    if (!tender) {
      return {
        tenderId,
        polled: false,
        statusChanged: false,
        deadlineChanged: false,
        notificationsSent: 0,
        error: 'Tender not found'
      };
    }

    // Check polling schedule unless explicitly forced
    if (!options?.force && !this.isDueForPolling(tender, now)) {
      return {
        tenderId,
        polled: false,
        statusChanged: false,
        deadlineChanged: false,
        notificationsSent: 0
      };
    }

    let statusChanged = false;
    let deadlineChanged = false;
    let notificationsSent = 0;
    const previousStatus = tender.status;
    let newStatus = tender.status;
    let rawPayload: any = null;

    // Fetch latest status from adapter or options
    if (options?.mockSourceData) {
      rawPayload = options.mockSourceData;
      if (rawPayload.statusId || rawPayload.status) {
        newStatus = this.mapSourceStatusToTenderStatus(rawPayload.statusId || rawPayload.status, previousStatus);
      }
    } else if (tender.source === 'GOSZAKUP') {
      try {
        const adapter = new GoszakupApiAdapter();
        const buyResult = await adapter.fetchBuyResult(tender.externalId);
        if (buyResult) {
          rawPayload = buyResult;
          newStatus = this.mapSourceStatusToTenderStatus(buyResult.statusId, previousStatus);
        }
      } catch (err: any) {
        console.warn(`[TenderPollingService] Source fetch error for ${tender.externalId}:`, err?.message);
      }
    }

    // 1. Detect Status Change
    if (newStatus && newStatus !== previousStatus) {
      statusChanged = true;

      // Persist TenderStatusEvent
      try {
        await prisma.tenderStatusEvent.create({
          data: {
            tenderId: tender.id,
            source: tender.source,
            previousStatus: previousStatus as any,
            newStatus: newStatus as any,
            changedAt: now,
            detectedAt: now,
            raw: rawPayload || { detectedBy: 'TenderPollingService' }
          }
        });
      } catch (err: any) {
        console.warn(`[TenderPollingService] Failed to create TenderStatusEvent:`, err?.message);
      }

      // Update Tender status in DB
      try {
        await prisma.tender.update({
          where: { id: tender.id },
          data: {
            status: newStatus as any,
            lastPolledAt: now
          }
        });
      } catch (err: any) {
        console.warn(`[TenderPollingService] Failed to update tender status:`, err?.message);
      }

      // Notify Telegram
      const prevLabel = STATUS_LABELS_RU[previousStatus] || previousStatus;
      const nextLabel = STATUS_LABELS_RU[newStatus] || newStatus;

      const message = 
        `🔔 <b>Смена статуса закупки!</b>\n\n` +
        `<b>${tender.title}</b>\n` +
        `📌 Было: <s>${prevLabel}</s>\n` +
        `✅ Стало: <b>${nextLabel}</b>\n` +
        `💰 Сумма: <b>${Number(tender.amount).toLocaleString('ru-RU')} ₸</b>\n` +
        `🏛️ Заказчик: ${tender.customerName}\n` +
        `⏳ Дедлайн: ${new Date(tender.deadlineDate).toLocaleDateString('ru-RU')}\n\n` +
        `🔗 <a href="${tender.sourceUrl}">Открыть на источнике (${tender.source})</a>`;

      const notified = await this.dispatchTenderNotification(tender, message);
      if (notified) notificationsSent++;
    } else {
      // Just update lastPolledAt
      try {
        await prisma.tender.update({
          where: { id: tender.id },
          data: { lastPolledAt: now }
        });
      } catch (err) {
        // DB fallback
      }
    }

    // 2. Detect Deadline Postponement (if rawPayload provides a new deadline)
    if (rawPayload?.newDeadlineDate || rawPayload?.endDate) {
      const candidateDate = new Date(rawPayload.newDeadlineDate || rawPayload.endDate);
      if (!isNaN(candidateDate.getTime()) && Math.abs(candidateDate.getTime() - new Date(tender.deadlineDate).getTime()) > 60000) {
        deadlineChanged = true;
        const oldDeadlineStr = new Date(tender.deadlineDate).toLocaleString('ru-RU');
        const newDeadlineStr = candidateDate.toLocaleString('ru-RU');

        try {
          await prisma.tender.update({
            where: { id: tender.id },
            data: { deadlineDate: candidateDate }
          });

          await prisma.tenderDeadline.updateMany({
            where: { tenderId: tender.id },
            data: { dueAt: candidateDate, status: 'PENDING' }
          });

          await prisma.tenderAuditTrail.create({
            data: {
              tenderId: tender.id,
              field: 'deadlineDate',
              oldValue: oldDeadlineStr,
              newValue: newDeadlineStr,
              changedBy: 'TenderPollingService'
            }
          });
        } catch (err: any) {
          console.warn(`[TenderPollingService] Error updating deadline date:`, err?.message);
        }

        const deadlineMsg = 
          `⏳ <b>Перенос срока (дедлайна) закупки!</b>\n\n` +
          `<b>${tender.title}</b>\n` +
          `📅 Новый срок: <b>${newDeadlineStr}</b>\n` +
          `🕒 Предыдущий срок: <s>${oldDeadlineStr}</s>\n` +
          `🏛️ Заказчик: ${tender.customerName}\n\n` +
          `🔗 <a href="${tender.sourceUrl}">Проверить на ${tender.source}</a>`;

        const notified = await this.dispatchTenderNotification(tender, deadlineMsg);
        if (notified) notificationsSent++;
      }
    }

    // 3. Approaching Deadline Urgent Alerts (24h and 3h reminders)
    const hoursRemaining = (new Date(tender.deadlineDate).getTime() - now.getTime()) / (1000 * 60 * 60);
    if (hoursRemaining > 0 && hoursRemaining <= 24) {
      const is3hAlert = hoursRemaining <= 3;
      const alertTag = is3hAlert ? 'URGENT_3H_ALERT' : 'URGENT_24H_ALERT';

      // Check if already notified for this stage to prevent spam
      const hasRecentDeadlineAlert = tender.deadlines?.some(
        (d: any) => d.deadlineType === alertTag && d.notifiedAt
      );

      if (!hasRecentDeadlineAlert) {
        const remainingStr = is3hAlert 
          ? `менее ${Math.max(1, Math.round(hoursRemaining))} ч.`
          : `${Math.round(hoursRemaining)} ч.`;

        const urgentMsg = 
          `⚠️ <b>Внимание: дедлайн приближается!</b>\n\n` +
          `<b>${tender.title}</b>\n` +
          `⏳ До окончания приёма заявок: <b>${remainingStr}</b>\n` +
          `📅 Срок: <b>${new Date(tender.deadlineDate).toLocaleString('ru-RU')}</b>\n` +
          `💰 Сумма лота: <b>${Number(tender.amount).toLocaleString('ru-RU')} ₸</b>\n\n` +
          `Не забудьте подать ценовое предложение и подписать документы!`;

        const notified = await this.dispatchTenderNotification(tender, urgentMsg);
        if (notified) {
          notificationsSent++;
          try {
            await prisma.tenderDeadline.updateMany({
              where: { tenderId: tender.id },
              data: { notifiedAt: now }
            });
          } catch {
            // DB fallback
          }
        }
      }
    }

    // 4. Detect Price / Amount Changes (§10.3 Phase 2 & §10.4 Phase 3)
    let priceChanged = false;
    const previousPrice = Number(tender.amount) || 0;
    let currentPrice = previousPrice;
    let redZoneCalculations = 0;
    let dumpingSeverity: string | null = null;

    const candidatePrice = rawPayload?.newPrice ?? rawPayload?.currentPrice ?? rawPayload?.price ?? rawPayload?.amount ?? rawPayload?.lotAmount;
    if (candidatePrice != null && !isNaN(Number(candidatePrice)) && Number(candidatePrice) > 0) {
      const parsedPrice = Number(candidatePrice);
      if (Math.abs(parsedPrice - previousPrice) > 0.01) {
        priceChanged = true;
        currentPrice = parsedPrice;

        // A. Update tender.amount in DB and record in audit trail
        try {
          await prisma.tender.update({
            where: { id: tender.id },
            data: { amount: currentPrice }
          });

          await prisma.tenderAuditTrail.create({
            data: {
              tenderId: tender.id,
              field: 'amount',
              oldValue: previousPrice.toString(),
              newValue: currentPrice.toString(),
              changedBy: 'TenderPollingService'
            }
          });
        } catch (err: any) {
          console.warn(`[TenderPollingService] Error updating tender amount:`, err?.message);
        }

        // B. Phase 2: Recalculate Profitability and detect Red Zone
        try {
          const calcResult = await TenderCalculationService.recalculateOnPriceChange(
            tender.id,
            currentPrice,
            { previousPrice }
          );
          redZoneCalculations = calcResult.redZoneCount;
          notificationsSent += calcResult.alertsSent;
        } catch (err: any) {
          console.warn(`[TenderPollingService] Error in recalculateOnPriceChange:`, err?.message);
        }

        // C. Phase 3: Anti-Dumping Analysis & Alerts
        try {
          const referencePrice = Number(rawPayload?.referencePrice || rawPayload?.plannedPrice || previousPrice) || currentPrice;
          const dumpingChatIds = await this.resolveNotificationChatIds(tender);
          const dumpingResult = await AntiDumpingService.checkDumping(
            tender,
            currentPrice,
            referencePrice,
            { chatIds: dumpingChatIds }
          );
          if (dumpingResult.triggered) {
            dumpingSeverity = dumpingResult.severity;
            if (dumpingResult.notificationSent) {
              notificationsSent++;
            }
          }
        } catch (err: any) {
          console.warn(`[TenderPollingService] Error in AntiDumpingService.checkDumping:`, err?.message);
        }
      }
    }

    return {
      tenderId: tender.id,
      polled: true,
      statusChanged,
      deadlineChanged,
      priceChanged,
      previousStatus,
      newStatus,
      previousPrice,
      newPrice: currentPrice,
      redZoneCalculations,
      dumpingSeverity,
      notificationsSent
    };
  }

  /**
   * Resolves the set of Telegram chat IDs that should be notified about a tender:
   * every Kanban card owner's linked chat, falling back to TELEGRAM_DEFAULT_CHAT_ID
   * only when no card owner has one linked. Shared by status/deadline notifications
   * (this service) and AntiDumpingService, which otherwise has no way to reach the
   * actual company following the tender.
   */
  static async resolveNotificationChatIds(tender: any): Promise<string[]> {
    const targetChatIds = new Set<string>();

    if (Array.isArray(tender.kanbanCards)) {
      for (const card of tender.kanbanCards) {
        if (card.userId) {
          const profile = await resolveOwnCompanyProfile(card.userId);
          if (profile?.telegramChatId) {
            targetChatIds.add(profile.telegramChatId);
          }
        }
      }
    }

    if (targetChatIds.size === 0 && process.env.TELEGRAM_DEFAULT_CHAT_ID) {
      targetChatIds.add(process.env.TELEGRAM_DEFAULT_CHAT_ID);
    }

    return Array.from(targetChatIds);
  }

  /**
   * Helper to dispatch notification to the relevant Telegram chat
   */
  private static async dispatchTenderNotification(tender: any, message: string): Promise<boolean> {
    const targetChatIds = await this.resolveNotificationChatIds(tender);

    if (targetChatIds.length === 0) {
      // Bot not configured or no linked chats
      return false;
    }

    let anyDelivered = false;
    for (const chatId of targetChatIds) {
      const result = await TelegramBotService.sendNotification(tender, chatId, message);
      if (result.success) {
        anyDelivered = true;
      }
    }
    return anyDelivered;
  }

  /**
   * Polls all active tenders currently taken into Kanban ('UNDER_REVIEW', 'PREPARING_BID', 'SUBMITTED')
   * that are due for polling under the adaptive schedule.
   */
  static async pollActiveKanbanTenders(now: Date = new Date()): Promise<BatchPollingSummary> {
    const activeStages = ['UNDER_REVIEW', 'PREPARING_BID', 'SUBMITTED'];
    let cards: any[] = [];

    try {
      cards = await prisma.kanbanCard.findMany({
        where: {
          stage: { in: activeStages as any }
        },
        include: {
          tender: true
        }
      });
    } catch (err: any) {
      console.warn(`[TenderPollingService] Error fetching Kanban cards:`, err?.message);
    }

    // Unique tenders map
    const uniqueTendersMap = new Map<string, any>();
    for (const card of cards) {
      if (card.tender && card.tender.id) {
        uniqueTendersMap.set(card.tender.id, card.tender);
      }
    }

    const uniqueTenders = Array.from(uniqueTendersMap.values());
    const results: PollTenderResult[] = [];
    let statusChanges = 0;
    let deadlineChanges = 0;
    let priceChanges = 0;
    let notificationsSent = 0;
    let polledTenders = 0;
    let skippedTenders = 0;

    for (const tender of uniqueTenders) {
      if (!this.isDueForPolling(tender, now)) {
        skippedTenders++;
        continue;
      }

      polledTenders++;
      const result = await this.pollTender(tender.id, { now });
      results.push(result);

      if (result.statusChanged) statusChanges++;
      if (result.deadlineChanged) deadlineChanges++;
      if (result.priceChanged) priceChanges++;
      notificationsSent += result.notificationsSent;
    }

    return {
      timestamp: now.toISOString(),
      totalActiveCards: cards.length,
      uniqueTenders: uniqueTenders.length,
      polledTenders,
      skippedTenders,
      statusChanges,
      deadlineChanges,
      priceChanges,
      notificationsSent,
      results
    };
  }
}
