import { PrismaClient, Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { 
  DEFAULT_DUMPING_THRESHOLDS, 
  DumpingThreshold, 
  DumpingAlert, 
  DumpingSeverity 
} from '../types/tender';
import { TelegramBotService } from './telegram.service';
import { roundMoney } from './tender-calculation.service';

export interface DumpingCheckResult {
  triggered: boolean;
  severity: DumpingSeverity | null;
  deviationPercent: number;
  thresholdPercent: number;
  currentPrice: number;
  referencePrice: number;
  alert?: any;
  notificationSent?: boolean;
}

export class AntiDumpingService {
  /**
   * Seeds standard Kazakhstani and Samruk-Kazyna procurement dumping thresholds
   * into the database if the table is currently empty.
   */
  static async seedDefaultThresholds(
    prismaClient: PrismaClient | Prisma.TransactionClient = prisma
  ): Promise<number> {
    try {
      const count = await (prismaClient as any).dumpingThreshold.count();
      if (count > 0) {
        return count;
      }

      let inserted = 0;
      for (const item of DEFAULT_DUMPING_THRESHOLDS) {
        await (prismaClient as any).dumpingThreshold.create({
          data: {
            source: item.source,
            procurementMethod: item.procurementMethod,
            subjectType: item.subjectType || 'ALL',
            thresholdPercent: item.thresholdPercent,
            descriptionRu: item.descriptionRu
          }
        });
        inserted++;
      }
      return inserted;
    } catch (err: any) {
      console.warn('[AntiDumpingService] Error seeding default dumping thresholds:', err?.message);
      return 0;
    }
  }

  /**
   * Inactive/fallback heuristic to detect subject type from tender textual attributes
   * (e.g. Construction / СМР 5%, Design / ПИР 10%, Supervision / Технадзор 10%).
   */
  static inferSubjectType(tender: { title?: string; category?: string; industryTags?: string[] }): string {
    const text = [
      tender.title || '',
      tender.category || '',
      ...(Array.isArray(tender.industryTags) ? tender.industryTags : [])
    ].join(' ').toLowerCase();

    // 1. Supervision / Авторский/Технадзор (10%)
    if (
      text.includes('технадзор') || 
      (text.includes('техническ') && text.includes('надзор')) || 
      (text.includes('авторск') && text.includes('надзор')) || 
      text.includes('экспертиз')
    ) {
      return 'SUPERVISION';
    }

    // 2. Design / ПИР (10%)
    if (
      text.includes('пир') || 
      text.includes('проектн') || 
      text.includes('изыскательск') || 
      text.includes('псд')
    ) {
      return 'DESIGN';
    }

    // 3. Construction / СМР (5%)
    if (
      text.includes('строител') || 
      text.includes('смр') || 
      (text.includes('капитальн') && text.includes('ремонт')) || 
      text.includes('реконструкц')
    ) {
      return 'CONSTRUCTION';
    }

    return 'ALL';
  }

  /**
   * Resolves the applicable dumping threshold percentage based on tender attributes,
   * checking the database dictionary first and falling back to regulatory defaults.
   */
  static async resolveThreshold(
    tender: {
      source?: string;
      procurementMethod?: string;
      title?: string;
      category?: string;
      industryTags?: string[];
    },
    options?: {
      subjectType?: string;
      prismaClient?: PrismaClient | Prisma.TransactionClient;
    }
  ): Promise<{ thresholdPercent: number; ruleSource: string; subjectType: string }> {
    const source = (tender.source || 'GOSZAKUP').toUpperCase();
    const method = (tender.procurementMethod || 'OPEN_TENDER').toUpperCase();
    const subjectType = options?.subjectType || this.inferSubjectType(tender);
    const client = options?.prismaClient || prisma;

    try {
      // 1. Try DB lookup with exact subjectType
      const exactDbMatch = await (client as any).dumpingThreshold.findFirst({
        where: {
          source,
          procurementMethod: method,
          subjectType
        },
        orderBy: { effectiveFrom: 'desc' }
      });

      if (exactDbMatch) {
        return {
          thresholdPercent: exactDbMatch.thresholdPercent,
          ruleSource: `DB:${exactDbMatch.source}:${exactDbMatch.procurementMethod}:${exactDbMatch.subjectType}`,
          subjectType
        };
      }

      // 2. Try DB lookup with subjectType = 'ALL'
      const fallbackDbMatch = await (client as any).dumpingThreshold.findFirst({
        where: {
          source,
          procurementMethod: method,
          subjectType: 'ALL'
        },
        orderBy: { effectiveFrom: 'desc' }
      });

      if (fallbackDbMatch) {
        return {
          thresholdPercent: fallbackDbMatch.thresholdPercent,
          ruleSource: `DB:${fallbackDbMatch.source}:${fallbackDbMatch.procurementMethod}:ALL`,
          subjectType: 'ALL'
        };
      }
    } catch {
      // DB unreachable in offline unit tests, proceed to static fallback
    }

    // 3. In-memory regulatory dictionary fallback
    const staticMatch = DEFAULT_DUMPING_THRESHOLDS.find(
      t => t.source === source && t.procurementMethod === method && t.subjectType === subjectType
    ) || DEFAULT_DUMPING_THRESHOLDS.find(
      t => t.source === source && t.procurementMethod === method && t.subjectType === 'ALL'
    ) || DEFAULT_DUMPING_THRESHOLDS.find(
      t => t.source === source && t.subjectType === subjectType
    ) || DEFAULT_DUMPING_THRESHOLDS.find(
      t => t.source === source && t.subjectType === 'ALL'
    ) || DEFAULT_DUMPING_THRESHOLDS.find(
      t => t.procurementMethod === method && t.subjectType === subjectType
    ) || DEFAULT_DUMPING_THRESHOLDS.find(
      t => t.procurementMethod === method && t.subjectType === 'ALL'
    ) || { thresholdPercent: 20.0, descriptionRu: 'Дефолтный порог 20%' };

    return {
      thresholdPercent: staticMatch.thresholdPercent,
      ruleSource: 'REGULATORY_DEFAULTS',
      subjectType
    };
  }

  /**
   * Checks whether a given current price represents a dumping risk or breach
   * compared to the reference price (tender amount or average price proposal).
   * 
   * Rule (§10.4):
   * - deviationPercent = ((referencePrice - currentPrice) / referencePrice) * 100
   * - distanceToThreshold <= 5 p.p. (and deviation > 0) -> WARNING (yellow)
   * - deviationPercent >= thresholdPercent -> CRITICAL (red)
   */
  static async checkDumping(
    tender: any,
    currentPrice: number,
    referencePrice: number,
    options?: {
      subjectType?: string;
      notes?: string;
      chatId?: string;
      chatIds?: string[];
      prismaClient?: PrismaClient | Prisma.TransactionClient;
    }
  ): Promise<DumpingCheckResult> {
    if (!referencePrice || referencePrice <= 0 || !currentPrice || currentPrice <= 0) {
      return {
        triggered: false,
        severity: null,
        deviationPercent: 0,
        thresholdPercent: 20.0,
        currentPrice,
        referencePrice
      };
    }

    const deviationPercent = roundMoney(((referencePrice - currentPrice) / referencePrice) * 100);
    const { thresholdPercent, subjectType } = await this.resolveThreshold(tender, {
      subjectType: options?.subjectType,
      prismaClient: options?.prismaClient
    });

    let severity: DumpingSeverity | null = null;

    if (deviationPercent >= thresholdPercent) {
      severity = 'CRITICAL';
    } else if (thresholdPercent - deviationPercent <= 5 && deviationPercent > 0) {
      severity = 'WARNING';
    }

    if (!severity) {
      return {
        triggered: false,
        severity: null,
        deviationPercent,
        thresholdPercent,
        currentPrice,
        referencePrice
      };
    }

    // Persist DumpingAlert in DB
    const client = options?.prismaClient || prisma;
    let createdAlert: any = null;

    try {
      createdAlert = await (client as any).dumpingAlert.create({
        data: {
          tenderId: tender.id,
          currentPrice,
          referencePrice,
          deviationPercent,
          thresholdPercent,
          severity,
          notes: options?.notes || `Порог демпинга: ${thresholdPercent}% (${subjectType})`
        }
      });
    } catch (err: any) {
      console.warn('[AntiDumpingService] Failed to create DumpingAlert in DB:', err?.message);
    }

    // Dispatch Telegram Alert to every resolved recipient (Kanban card owners of this
    // tender, falling back to TELEGRAM_DEFAULT_CHAT_ID only when none is linked — see
    // TenderPollingService.resolveNotificationChatIds, the caller resolves this).
    let notificationSent = false;
    const targetChatIds = options?.chatIds && options.chatIds.length > 0
      ? options.chatIds
      : options?.chatId
      ? [options.chatId]
      : process.env.TELEGRAM_DEFAULT_CHAT_ID
      ? [process.env.TELEGRAM_DEFAULT_CHAT_ID]
      : [];

    if (targetChatIds.length > 0) {
      const isCritical = severity === 'CRITICAL';
      const distance = roundMoney(thresholdPercent - deviationPercent);

      const message = isCritical ? (
        `🚨 <b>Внимание: демпинг зафиксирован!</b>\n\n` +
        `<b>${tender.title || 'Лот закупки'}</b>\n` +
        `🛑 Превышен порог демпинга: <b>${deviationPercent}%</b> (допустимо: <b>${thresholdPercent}%</b>)\n` +
        `💰 Предложенная цена: <b>${Number(currentPrice).toLocaleString('ru-RU')} ₸</b>\n` +
        `📊 Базовая цена: <b>${Number(referencePrice).toLocaleString('ru-RU')} ₸</b>\n\n` +
        `⚠️ Заявка с такой ценой подпадает под требование антидемпингового обеспечения по ст. 26 Закона о госзакупках РК!`
      ) : (
        `⚠️ <b>Предупреждение о демпинге!</b>\n\n` +
        `<b>${tender.title || 'Лот закупки'}</b>\n` +
        `📉 Текущее снижение: <b>${deviationPercent}%</b>\n` +
        `🛑 Порог демпинга: <b>${thresholdPercent}%</b>\n` +
        `⚠️ До порога осталось: <b>${distance} п.п.</b>\n` +
        `💰 Предложенная цена: <b>${Number(currentPrice).toLocaleString('ru-RU')} ₸</b>\n` +
        `📊 Плановая цена: <b>${Number(referencePrice).toLocaleString('ru-RU')} ₸</b>\n\n` +
        `При дальнейшем снижении потребуется антидемпинговое обеспечение или заявка будет отклонена!`
      );

      for (const chatId of targetChatIds) {
        try {
          const delivery = await TelegramBotService.sendNotification(tender, chatId, message);
          if (delivery.success) notificationSent = true;
        } catch (err: any) {
          console.warn('[AntiDumpingService] Telegram alert delivery failed:', err?.message);
        }
      }
    }

    return {
      triggered: true,
      severity,
      deviationPercent,
      thresholdPercent,
      currentPrice,
      referencePrice,
      alert: createdAlert,
      notificationSent
    };
  }
}
