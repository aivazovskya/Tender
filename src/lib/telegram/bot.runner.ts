import { TelegrafBotService } from './bot.service';

/**
 * Delegates standalone bot creation directly to TelegrafBotService.initBot()
 * to avoid duplicate code and ensure all handlers run asynchronously against PostgreSQL DB.
 */
export const createTelegrafBot = () => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || token.trim().length === 0 || token.includes('your_')) {
    console.log('[TelegrafBot] TELEGRAM_BOT_TOKEN не настроен. Используется UI-эмулятор Telegram.');
    return null;
  }

  // Synchronous wrapper returning initialized bot instance via TelegrafBotService.initBot()
  let bot: any = null;
  TelegrafBotService.initBot().then(instance => {
    bot = instance;
  }).catch(err => {
    console.error('[TelegrafBot] Ошибка инициализации бота:', err);
  });

  return bot;
};
