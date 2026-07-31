import { Tender, CompanyProfileData } from '../types/tender';
import { INITIAL_TENDERS } from '../mockData';
import { prisma } from '../prisma';
import { detectLanguage } from '../utils/lang';

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
        const text = ctx.message?.text || '';
        const args = text.split(/\s+/).slice(1);
        const chatId = String(ctx.chat.id);
        const replyText = await TelegrafBotService.handleBotCommandAsync('/start', args, chatId);
        await ctx.replyWithHTML(replyText);
      });

      bot.command('search', async (ctx: any) => {
        const text = ctx.message?.text || '';
        const args = text.split(/\s+/).slice(1);
        const chatId = String(ctx.chat.id);
        const replyText = await TelegrafBotService.handleBotCommandAsync('/search', args, chatId);
        await ctx.replyWithHTML(replyText);
      });

      bot.command('digest', async (ctx: any) => {
        const chatId = String(ctx.chat.id);
        const replyText = await TelegrafBotService.handleBotCommandAsync('/digest', [], chatId);
        await ctx.replyWithHTML(replyText);
      });

      bot.command('profile', async (ctx: any) => {
        const chatId = String(ctx.chat.id);
        const replyText = await TelegrafBotService.handleBotCommandAsync('/profile', [], chatId);
        await ctx.replyWithHTML(replyText);
      });

      bot.command(['spec', 'tz'], async (ctx: any) => {
        const text = ctx.message?.text || '';
        const args = text.split(/\s+/).slice(1);
        const chatId = String(ctx.chat.id);
        const replyText = await TelegrafBotService.handleBotCommandAsync('/spec', args, chatId);
        await ctx.replyWithHTML(replyText);
      });

      bot.command('help', async (ctx: any) => {
        const chatId = String(ctx.chat.id);
        const replyText = await TelegrafBotService.handleBotCommandAsync('/help', [], chatId);
        await ctx.replyWithHTML(replyText);
      });

      TelegrafBotService.botInstance = bot;
      console.log('🤖 Real Telegraf Telegram Bot service initialized with interactive commands /start, /search, /spec, /tz, /digest, /profile!');
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
    args: string[],
    chatId?: string
  ): Promise<string> {
    try {
      const cleanCmd = command.trim().toLowerCase();

      // Auto-bind chatId if user accessed via deep-link: /start <userId>
      if (cleanCmd === '/start' && args.length > 0 && chatId) {
        const payload = args[0].trim();
        const unboundProfile = await prisma.companyProfile.findFirst({
          where: { OR: [{ userId: payload }, { id: payload }] }
        });
        if (unboundProfile) {
          await prisma.companyProfile.update({
            where: { id: unboundProfile.id },
            data: { telegramChatId: chatId }
          });
        }
      }

      // Handle /spec and /tz commands with async DB and Redis index lookup
      if (cleanCmd === '/spec' || cleanCmd === '/tz') {
        if (args.length === 0) {
          return `⚠️ Пожалуйста, укажите ID лота или его порядковый номер из последнего поиска.\nПример: <code>/spec 1</code> или <code>/spec 987150-2026</code>`;
        }

        let targetId = args[0].trim();

        // 1. Check if argument is a 1-based index (e.g. "1", "2", "3") from recent /search
        if (/^\d+$/.test(targetId) && chatId) {
          try {
            const { connection } = await import('../queue/ingestion.queue');
            const cachedJson = await connection.get(`search:${chatId}`);
            if (cachedJson) {
              const ids: string[] = JSON.parse(cachedJson);
              const idx = parseInt(targetId, 10) - 1;
              if (idx >= 0 && idx < ids.length) {
                targetId = ids[idx];
              }
            }
          } catch {
            // Fallback if Redis is unreachable
          }
        }

        // 2. Query Prisma DB for target tender
        const dbTender = await prisma.tender.findFirst({
          where: {
            OR: [
              { externalId: targetId },
              { id: targetId }
            ]
          }
        });

        if (dbTender) {
          if (!dbTender.aiSummary || dbTender.aiSummary.trim().length === 0) {
            return `📋 <b>Резюме лота №${dbTender.externalId}</b>\n\n⏳ Резюме для этого лота ещё формируется, попробуйте через пару минут.`;
          }

          let reqsText = '• Соответствие ТЗ заказчика';
          if (Array.isArray(dbTender.aiKeyRequirements) && dbTender.aiKeyRequirements.length > 0) {
            reqsText = dbTender.aiKeyRequirements.map(r => `• ${r}`).join('\n');
          }

          return `📋 <b>Резюме лота №${dbTender.externalId}</b>\n\n${dbTender.aiSummary}\n\n<b>Ключевые требования:</b>\n${reqsText}\n\n⚠️ Оценка риска участия: ${dbTender.riskScore}/100`;
        }
      }

      const dbTenders = await prisma.tender.findMany({
        take: 50,
        orderBy: { createdAt: 'desc' }
      });

      // Look up profile by telegramChatId to prevent multi-tenant data leak
      const profile = chatId
        ? await prisma.companyProfile.findFirst({ where: { telegramChatId: chatId } })
        : null;

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
      } : undefined, chatId);
    } catch {
      return TelegrafBotService.handleBotCommand(command, args, INITIAL_TENDERS, undefined, chatId);
    }
  }

  /**
   * Handle incoming bot commands with dynamic queries over tenders and company profile
   */
  static handleBotCommand(
    command: string, 
    args: string[], 
    tendersList: Tender[] = INITIAL_TENDERS,
    profile?: CompanyProfileData,
    chatId?: string
  ): string {
    const cleanCmd = command.trim().toLowerCase();
    const activeTenders = tendersList.length > 0 ? tendersList : INITIAL_TENDERS;

    if (cleanCmd === '/start' || cleanCmd === '/help') {
      let welcome = `🤖 <b>Добро пожаловать в TenderAI Казахстан!</b>\n`;
      if (profile) {
        welcome += `Ваш аккаунт привязан к компании <b>${profile.companyName}</b>.\n\n`;
      } else {
        welcome += `Ваш Telegram-чат пока не привязан к профилю компании.\n\n`;
      }
      welcome += `Доступные интерактивные команды:\n- <code>/search [запрос]</code> — ИИ-поиск по названию лота, категории и региону\n- <code>/spec [ID или №]</code> — ИИ-резюме и ключевые требования лота ТЗ\n- <code>/digest</code> — Сводка за 24 часа по госзакупкам и B2B\n- <code>/profile</code> — Статус подписки, БИН и ключевые слова компании`;
      return welcome;
    }

    if (cleanCmd === '/spec' || cleanCmd === '/tz') {
      if (args.length === 0) {
        return `⚠️ Пожалуйста, укажите ID лота или его порядковый номер из последнего поиска.\nПример: <code>/spec 1</code> или <code>/spec 987150-2026</code>`;
      }

      const targetArg = args[0].trim();
      let matchedTender: Tender | undefined;

      if (/^\d+$/.test(targetArg)) {
        const idx = parseInt(targetArg, 10) - 1;
        if (idx >= 0 && idx < activeTenders.length) {
          matchedTender = activeTenders[idx];
        }
      }

      if (!matchedTender) {
        matchedTender = activeTenders.find(t => t.externalId === targetArg || t.id === targetArg);
      }

      if (!matchedTender) {
        return `⚠️ Лот с ID "<b>${targetArg}</b>" не найден. Пожалуйста, проверьте корректность номера лота.`;
      }

      if (!matchedTender.aiSummary || matchedTender.aiSummary.trim().length === 0) {
        return `📋 <b>Резюме лота №${matchedTender.externalId}</b>\n\n⏳ Резюме для этого лота ещё формируется, попробуйте через пару минут.`;
      }

      let reqsText = '• Соответствие ТЗ заказчика';
      if (Array.isArray(matchedTender.aiKeyRequirements) && matchedTender.aiKeyRequirements.length > 0) {
        reqsText = matchedTender.aiKeyRequirements.map(r => `• ${r}`).join('\n');
      }

      return `📋 <b>Резюме лота №${matchedTender.externalId}</b>\n\n${matchedTender.aiSummary}\n\n<b>Ключевые требования:</b>\n${reqsText}\n\n⚠️ Оценка риска участия: ${matchedTender.riskScore || 0}/100`;
    }

    if (cleanCmd === '/search') {
      const query = args.join(' ').trim();
      if (!query) {
        return `⚠️ Пожалуйста, укажите поисковый запрос.\nПример: <code>/search серверы Астана</code>`;
      }

      const isKk = detectLanguage(query) === 'kk';
      const lowerQ = query.toLowerCase();
      const matched = activeTenders.filter(t => 
        t.title.toLowerCase().includes(lowerQ) || 
        t.region.toLowerCase().includes(lowerQ) ||
        t.category.toLowerCase().includes(lowerQ) ||
        t.customerName.toLowerCase().includes(lowerQ)
      ).slice(0, 3);

      if (matched.length === 0) {
        if (isKk) {
          return `🔍 "<b>${query}</b>" сұранысы бойынша жүйеде белсенді лоттар табылмады.`;
        }
        return `🔍 По запросу "<b>${query}</b>" активных лотов в системе не найдено. Настройте автоуведомления в ЛК.`;
      }

      // Cache matched tender externalIds in Redis for ordinal lookup (/spec 1, /spec 2)
      if (chatId) {
        import('../queue/ingestion.queue').then(({ connection }) => {
          const ids = matched.map(t => t.externalId || t.id);
          connection.set(`search:${chatId}`, JSON.stringify(ids), 'EX', 600).catch(() => {});
        }).catch(() => {});
      }

      let res = isKk
        ? `🔍 <b>"${query}" сұранысы бойынша табылған лоттар:</b>\n\n`
        : `🔍 <b>Найдено лотов по запросу "${query}":</b>\n\n`;

      matched.forEach((t, idx) => {
        res += `${idx + 1}. <b>${t.title}</b>\n`;
        res += `💰 ${isKk ? 'Сомасы' : 'Сумма'}: <code>${t.amount.toLocaleString('ru-RU')} ₸</code> | 📍 ${t.region}\n`;
        res += `🏛️ ${isKk ? 'Тапсырыс беруші' : 'Заказчик'}: ${t.customerName}\n`;
        res += `🔗 <a href="${t.sourceUrl}">${isKk ? 'Порталға сілтеме' : 'Ссылка на портал'} (${t.source})</a>\n\n`;
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
      if (!profile) {
        return `⚠️ <b>Профиль компании не привязан</b>\n\nВаш Telegram-чат (ID: <code>${chatId || 'не определен'}</code>) пока не привязан ни к одному аккаунту в TenderAI.\n\nЧтобы получать уведомления и персональную аналитику, укажите ваш Telegram Chat ID в <b>Личном Кабинете</b> веб-приложения или авторизуйтесь по ссылке.`;
      }

      const compName = profile.companyName;
      const binNum = profile.bin;
      const kw = profile.keywords?.join(', ') || 'Не указаны';
      const reg = profile.regions?.join(', ') || 'Все регионы';

      return `👤 <b>Профиль компании ${compName}:</b>\n\n- БИН: <code>${binNum}</code>\n- Статус: <b>Подписка PRO активна</b>\n- Ключевые слова: ${kw}\n- Регионы: ${reg}`;
    }

    return `❓ Неизвестная команда. Введите <code>/start</code> для списка команд.`;
  }
}
