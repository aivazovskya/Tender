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

    bot.start(async (ctx: any) => {
      const text = ctx.message?.text || '';
      const args = text.split(/\s+/).slice(1);
      const chatId = String(ctx.chat.id);
      const reply = await TelegrafBotService.handleBotCommandAsync('/start', args, chatId);
      await ctx.replyWithHTML(reply);
    });

    bot.command('search', async (ctx: any) => {
      const text = ctx.message?.text || '';
      const args = text.split(/\s+/).slice(1);
      const chatId = String(ctx.chat.id);
      const reply = await TelegrafBotService.handleBotCommandAsync('/search', args, chatId);
      await ctx.replyWithHTML(reply);
    });

    bot.command('digest', async (ctx: any) => {
      const chatId = String(ctx.chat.id);
      const reply = await TelegrafBotService.handleBotCommandAsync('/digest', [], chatId);
      await ctx.replyWithHTML(reply);
    });

    bot.command('profile', async (ctx: any) => {
      const chatId = String(ctx.chat.id);
      const reply = await TelegrafBotService.handleBotCommandAsync('/profile', [], chatId);
      await ctx.replyWithHTML(reply);
    });

    bot.command('help', async (ctx: any) => {
      const chatId = String(ctx.chat.id);
      const reply = await TelegrafBotService.handleBotCommandAsync('/help', [], chatId);
      await ctx.replyWithHTML(reply);
    });

    return bot;
  } catch (err) {
    console.error('[TelegrafBot] Ошибка инициализации бота:', err);
    return null;
  }
};
