import { Tender, CompanyProfileData } from '../types/tender';
import { INITIAL_TENDERS } from '../mockData';

export class TelegrafBotService {
  private static botInstance: any = null;

  /**
   * Initialize interactive Telegraf Telegram Bot with command handlers (Server-Side only)
   */
  static async initBot(): Promise<any> {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token || token.trim().length === 0 || token.includes('your_')) {
      console.log('[TelegrafBotService] TELEGRAM_BOT_TOKEN не задан. Бот работает в режиме эмулятора.');
      return null;
    }

    if (TelegrafBotService.botInstance) {
      return TelegrafBotService.botInstance;
    }

    try {
      const { Telegraf } = await import('telegraf');
      const bot = new Telegraf(token);

      bot.start(async (ctx: any) => {
        const text = TelegrafBotService.handleBotCommand('/start', []);
        await ctx.replyWithHTML(text);
      });

      bot.command('search', async (ctx: any) => {
        const text = ctx.message?.text || '';
        const args = text.split(/\s+/).slice(1);
        const replyText = await TelegrafBotService.handleBotCommandAsync('/search', args);
        await ctx.replyWithHTML(replyText);
      });

      bot.command('digest', async (ctx: any) => {
        const replyText = await TelegrafBotService.handleBotCommandAsync('/digest', []);
        await ctx.replyWithHTML(replyText);
      });

      bot.command('profile', async (ctx: any) => {
        const replyText = await TelegrafBotService.handleBotCommandAsync('/profile', []);
        await ctx.replyWithHTML(replyText);
      });

      bot.command('help', async (ctx: any) => {
        const text = TelegrafBotService.handleBotCommand('/start', []);
        await ctx.replyWithHTML(text);
      });

      TelegrafBotService.botInstance = bot;
      console.log('🤖 Real Telegraf Telegram Bot service initialized with interactive commands /start, /search, /digest, /profile!');
      return bot;
    } catch (err) {
      console.error('[TelegrafBotService] Ошибка создания Telegraf инстанса:', err);
      return null;
    }
  }

  /**
   * Generates deep link URL for connecting Telegram chat ID to user account
   */
  static generateDeepLink(userId: string): string {
    return `https://t.me/TenderAI_KZ_bot?start=${userId}`;
  }

  /**
   * Async handler querying real PostgreSQL Prisma DB for tenders & company profiles
   */
  static async handleBotCommandAsync(
    command: string,
    args: string[]
  ): Promise<string> {
    try {
      const { PrismaClient } = await import('@prisma/client');
      const prisma = new PrismaClient();
      const dbTenders = await prisma.tender.findMany({
        take: 50,
        orderBy: { createdAt: 'desc' }
      });
      const profile = await prisma.companyProfile.findFirst();

      const tendersList: Tender[] = dbTenders.length > 0 ? dbTenders.map(t => ({
        id: t.id,
        source: t.source as any,
        externalId: t.externalId,
        title: t.title,
        description: t.description || undefined,
        customerName: t.customerName,
        customerBin: t.customerBin,
        category: t.category,
        industryTags: t.industryTags,
        procurementMethod: t.procurementMethod as any,
        amount: t.amount,
        currency: 'KZT',
        region: t.region,
        publishDate: t.publishDate.toISOString(),
        deadlineDate: t.deadlineDate.toISOString(),
        applicationSecurityAmount: t.applicationSecurityAmount || undefined,
        applicationSecurityPercent: t.applicationSecurityPercent || undefined,
        status: t.status,
        sourceUrl: t.sourceUrl,
        aiSummary: t.aiSummary || undefined,
        aiKeyRequirements: t.aiKeyRequirements,
        riskScore: t.riskScore,
        riskFlags: [],
        documents: [],
        history: []
      })) : INITIAL_TENDERS;

      return TelegrafBotService.handleBotCommand(command, args, tendersList, profile ? {
        companyName: profile.companyName,
        bin: profile.bin,
        activities: profile.activities,
        keywords: profile.keywords,
        regions: profile.regions,
        minAmount: profile.minAmount,
        maxAmount: profile.maxAmount || 0,
        contactEmail: profile.contactEmail
      } : undefined);
    } catch {
      return TelegrafBotService.handleBotCommand(command, args, INITIAL_TENDERS);
    }
  }

  /**
   * Handle incoming bot commands with dynamic queries over tenders and company profile
   */
  static handleBotCommand(
    command: string, 
    args: string[], 
    tendersList: Tender[] = INITIAL_TENDERS,
    profile?: CompanyProfileData
  ): string {
    const cleanCmd = command.trim().toLowerCase();
    const activeTenders = tendersList.length > 0 ? tendersList : INITIAL_TENDERS;

    if (cleanCmd === '/start' || cleanCmd === '/help') {
      return `🤖 <b>Добро пожаловать в TenderAI Казахстан!</b>\nВаш аккаунт привязан к системе мгновенных уведомлений.\n\nДоступные интерактивные команды:\n- <code>/search [запрос]</code> — ИИ-поиск по названию лота, категории и региону\n- <code>/digest</code> — Сводка за 24 часа по госзакупкам и B2B\n- <code>/profile</code> — Статус подписки, БИН и ключевые слова компании`;
    }

    if (cleanCmd === '/search') {
      const query = args.join(' ').trim();
      if (!query) {
        return `⚠️ Пожалуйста, укажите поисковый запрос.\nПример: <code>/search серверы Астана</code>`;
      }

      const lowerQ = query.toLowerCase();
      const matched = activeTenders.filter(t => 
        t.title.toLowerCase().includes(lowerQ) || 
        t.region.toLowerCase().includes(lowerQ) ||
        t.category.toLowerCase().includes(lowerQ) ||
        t.customerName.toLowerCase().includes(lowerQ)
      ).slice(0, 3);

      if (matched.length === 0) {
        return `🔍 По запросу "<b>${query}</b>" активных лотов в системе не найдено. Настройте автоуведомления в ЛК.`;
      }

      let res = `🔍 <b>Найдено лотов по запросу "${query}":</b>\n\n`;
      matched.forEach((t, idx) => {
        res += `${idx + 1}. <b>${t.title}</b>\n`;
        res += `💰 Сумма: <code>${t.amount.toLocaleString('ru-RU')} ₸</code> | 📍 ${t.region}\n`;
        res += `🏛️ Заказчик: ${t.customerName}\n`;
        res += `🔗 <a href="${t.sourceUrl}">Ссылка на портал (${t.source})</a>\n\n`;
      });

      return res;
    }

    if (cleanCmd === '/digest') {
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const recentTenders = activeTenders.filter(t => new Date(t.publishDate) >= oneDayAgo);
      const targetList = recentTenders.length > 0 ? recentTenders : activeTenders.slice(0, 5);

      const count = targetList.length;
      const totalAmountKzt = targetList.reduce((acc, t) => acc + t.amount, 0);

      let digestMsg = `📊 <b>Суточный Дайджест TenderAI (Казахстан)</b>\n\n`;
      digestMsg += `&bull; Новых лотов за 24 часа: <b>${count}</b>\n`;
      digestMsg += `&bull; Общий объем закупок: <b>${(totalAmountKzt / 1000000).toFixed(1)} млн ₸</b>\n\n`;
      digestMsg += `<b>Топ-2 крупных лота:</b>\n`;

      targetList.slice(0, 2).forEach(t => {
        digestMsg += `📍 <b>${t.title}</b> (${t.amount.toLocaleString('ru-RU')} ₸)\n`;
      });

      return digestMsg;
    }

    if (cleanCmd === '/profile') {
      const compName = profile?.companyName || 'ТОО "КазИТ Сервис"';
      const binNum = profile?.bin || '180940004512';
      const kw = profile?.keywords?.join(', ') || 'Серверы, Сетевое оборудование, ИТ-услуги';
      const reg = profile?.regions?.join(', ') || 'г. Астана, г. Алматы';

      return `👤 <b>Профиль компании ${compName}:</b>\n\n- БИН: <code>${binNum}</code>\n- Статус: <b>Подписка PRO активна</b>\n- Ключевые слова: ${kw}\n- Регионы: ${reg}`;
    }

    return `❓ Неизвестная команда. Введите <code>/start</code> для списка команд.`;
  }
}
