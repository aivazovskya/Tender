import { prisma } from '../prisma';

export type DataSourceStatus = 'HEALTHY' | 'WARNING' | 'FAILED';

export class IngestionHealthService {
  private static readonly MAX_SILENT_HOURS = 6;
  private static readonly MAX_CONSECUTIVE_ERRORS = 3;

  /**
   * Records a successful ingestion run for a given data source
   */
  static async recordSuccess(sourceName: string, count: number = 0) {
    try {
      await prisma.dataSourceHealth.upsert({
        where: { sourceName },
        create: {
          sourceName,
          status: 'HEALTHY',
          lastSuccessAt: new Date(),
          tendersIngested24h: count,
          consecutiveFailures: 0,
          errorCount24h: 0
        },
        update: {
          status: 'HEALTHY',
          lastSuccessAt: new Date(),
          tendersIngested24h: { increment: count },
          consecutiveFailures: 0
        }
      });
    } catch (err) {
      console.error(`[IngestionHealthService] Failed to record success for ${sourceName}:`, err);
    }
  }

  /**
   * Records an ingestion error for a given data source and triggers alerts if critical
   */
  static async recordError(sourceName: string, errorMessage: string) {
    try {
      const existing = await prisma.dataSourceHealth.findUnique({
        where: { sourceName }
      });

      const consecutiveFailures = (existing?.consecutiveFailures || 0) + 1;
      const status: DataSourceStatus = consecutiveFailures >= IngestionHealthService.MAX_CONSECUTIVE_ERRORS ? 'FAILED' : 'WARNING';

      await prisma.dataSourceHealth.upsert({
        where: { sourceName },
        create: {
          sourceName,
          status,
          lastErrorAt: new Date(),
          errorCount24h: 1,
          consecutiveFailures,
          lastErrorMessage: errorMessage.substring(0, 500)
        },
        update: {
          status,
          lastErrorAt: new Date(),
          errorCount24h: { increment: 1 },
          consecutiveFailures,
          lastErrorMessage: errorMessage.substring(0, 500)
        }
      });

      if (status === 'FAILED') {
        await IngestionHealthService.sendTelegramAlert(
          `🚨 <b>Сбой источника тендеров: ${sourceName}</b>\n\n` +
          `Статус: <b>FAILED</b> (ошибок подряд: ${consecutiveFailures})\n` +
          `Текст ошибки: <code>${errorMessage.substring(0, 200)}</code>\n\n` +
          `Рекомендуется проверить работоспособность портала и вёрстку скрапера.`
        );
      }
    } catch (err) {
      console.error(`[IngestionHealthService] Failed to record error for ${sourceName}:`, err);
    }
  }

  /**
   * Heartbeat check: Detects silent scraper failures (0 tenders ingested in last 6h during working hours)
   */
  static async checkHeartbeats() {
    try {
      const sources = await prisma.dataSourceHealth.findMany();
      const now = new Date();

      for (const source of sources) {
        const hoursSinceSuccess = (now.getTime() - new Date(source.lastSuccessAt).getTime()) / (1000 * 60 * 60);

        if (hoursSinceSuccess > IngestionHealthService.MAX_SILENT_HOURS && source.status !== 'FAILED') {
          await prisma.dataSourceHealth.update({
            where: { id: source.id },
            data: { status: 'WARNING' }
          });

          await IngestionHealthService.sendTelegramAlert(
            `⚠️ <b>Внимание: Источник ${source.sourceName} молчит ${Math.round(hoursSinceSuccess)}ч</b>\n\n` +
            `За последние ${IngestionHealthService.MAX_SILENT_HOURS} часов не поступило ни одного нового тендера.\n` +
            `Возможные причины: вёрстка сайта изменилась или источник заблокировал IP.`
          );
        }
      }
    } catch (err) {
      console.error('[IngestionHealthService] Failed to check heartbeats:', err);
    }
  }

  /**
   * Returns complete status summary of all data source connectors
   */
  static async getHealthSummary() {
    try {
      const healthRecords = await prisma.dataSourceHealth.findMany({
        orderBy: { sourceName: 'asc' }
      });

      const DEFAULT_SOURCES = ['Goszakup', 'Samruk', 'Scraper'];
      const result = DEFAULT_SOURCES.map(sourceName => {
        const record = healthRecords.find(r => r.sourceName.toLowerCase() === sourceName.toLowerCase());
        if (record) {
          return record;
        }
        return {
          id: `default-${sourceName}`,
          sourceName,
          status: 'HEALTHY' as DataSourceStatus,
          lastSuccessAt: new Date(),
          lastErrorAt: null,
          errorCount24h: 0,
          tendersIngested24h: 0,
          consecutiveFailures: 0,
          lastErrorMessage: null,
          createdAt: new Date(),
          updatedAt: new Date()
        };
      });

      return result;
    } catch (err) {
      console.error('[IngestionHealthService] Failed to get health summary:', err);
      return [];
    }
  }

  /**
   * Helper to send admin Telegram alert via webhooks or bot token
   */
  private static async sendTelegramAlert(htmlMessage: string) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;

    if (!botToken || !chatId) {
      console.warn('[IngestionHealthService] Telegram bot credentials missing, skipping alert:', htmlMessage);
      return;
    }

    try {
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: htmlMessage,
          parse_mode: 'HTML'
        })
      });
    } catch (err) {
      console.error('[IngestionHealthService] Failed to send Telegram alert:', err);
    }
  }
}
