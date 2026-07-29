import { Telegraf } from 'telegraf';
import { TelegrafBotService } from './bot.service';

/**
 * Initializes real standalone Telegraf bot instance if TELEGRAM_BOT_TOKEN is set
 */
export const createTelegrafBot = () => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || token.trim().length === 0 || token.includes('your_')) {
    console.log('[TelegrafBot] TELEGRAM_BOT_TOKEN не настроен. Используется UI-эмулятор Telegram.');
    return null;
  }

  try {
    const bot = new Telegraf(token);

    bot.start((ctx) => {
      const reply = TelegrafBotService.handleBotCommand('/start', []);
      ctx.replyWithHTML(reply);
    });

    bot.command('search', (ctx) => {
      const text = ctx.message?.text || '';
      const args = text.split(/\s+/).slice(1);
      const reply = TelegrafBotService.handleBotCommand('/search', args);
      ctx.replyWithHTML(reply);
    });

    bot.command('digest', (ctx) => {
      const reply = TelegrafBotService.handleBotCommand('/digest', []);
      ctx.replyWithHTML(reply);
    });

    bot.command('profile', (ctx) => {
      const reply = TelegrafBotService.handleBotCommand('/profile', []);
      ctx.replyWithHTML(reply);
    });

    return bot;
  } catch (err) {
    console.error('[TelegrafBot] Ошибка инициализации бота:', err);
    return null;
  }
};
