import { Tender } from '../types/tender';

export interface TelegramDeliveryResult {
  success: boolean;
  skipped?: boolean;
  message?: string;
}

export class TelegramBotService {
  private static mockLogs: string[] = [];

  /**
   * Sends real Telegram notification via Telegram Bot API HTTP POST
   */
  static async sendNotification(tender: Tender, chatId?: string, customMessage?: string): Promise<TelegramDeliveryResult> {
    const targetChatId = chatId || process.env.TELEGRAM_DEFAULT_CHAT_ID;
    const botToken = process.env.TELEGRAM_BOT_TOKEN;

    const messageText = customMessage || (
      `🚨 <b>Новый релевантный тендер!</b>\n\n` +
      `<b>${tender.title}</b>\n` +
      `💰 Сумма: <b>${tender.amount.toLocaleString('ru-RU')} KZT</b>\n` +
      `🏛️ Заказчик: ${tender.customerName} (БИН: ${tender.customerBin})\n` +
      `📍 Регион: ${tender.region}\n` +
      `⏳ Дедлайн: ${new Date(tender.deadlineDate).toLocaleDateString('ru-RU')}\n` +
      `🛡️ Риск-индекс: ${tender.riskScore}/100\n\n` +
      `🔗 <a href="${tender.sourceUrl}">Перейти на ${tender.source}</a>`
    );

    const logEntry = `[${new Date().toLocaleTimeString()}] Alert for Tender #${tender.externalId} -> ${targetChatId || 'No Chat ID'}`;
    this.mockLogs.unshift(logEntry);

    // If bot token or valid chat ID is unconfigured, return explicit skipped status
    if (!botToken || !targetChatId || targetChatId.startsWith('@fake')) {
      return {
        success: false,
        skipped: true,
        message: 'Telegram bot token or chat ID is not configured.'
      };
    }

    try {
      const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: targetChatId,
          text: messageText,
          parse_mode: 'HTML',
          disable_web_page_preview: false
        })
      });
      const data = await response.json();
      return {
        success: Boolean(data.ok),
        skipped: false,
        message: data.ok ? 'Delivered via Telegram API' : data.description
      };
    } catch (err: any) {
      console.error('[Telegram API Delivery Error]:', err);
      return {
        success: false,
        skipped: false,
        message: err.message || 'Network error delivering telegram notification'
      };
    }
  }

  static getLogs(): string[] {
    return this.mockLogs;
  }
}
