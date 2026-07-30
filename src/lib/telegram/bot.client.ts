import { Tender, CompanyProfileData } from '../types/tender';
import { INITIAL_TENDERS } from '../mockData';

export function generateDeepLink(userId: string): string {
  return `https://t.me/TenderAI_KZ_bot?start=${userId}`;
}

export function handleBotCommand(
  command: string,
  args: string[] = [],
  tenders: Tender[] = INITIAL_TENDERS,
  profile?: CompanyProfileData
): string {
  const cmd = command.trim().toLowerCase();

  switch (cmd) {
    case '/start':
      return `👋 <b>Добро пожаловать в TenderAI Bot!</b>\n\nЯ интеллектуальный ассистент по моринторингу и анализу тендерных закупок РК (goszakup.gov.kz, Самрук-Казына, B2B).\n\n<b>Доступные команды:</b>\n/search [запрос] — умный поиск тендеров\n/spec [ID] или /tz [ID] — ИИ-выжимка ТЗ лота\n/digest — персональный дайджест лотов\n/profile — настройки вашей компании\n/help — справочная информация`;

    case '/help':
      return `ℹ️ <b>Справка по использованию бота TenderAI:</b>\n\n• <code>/search серверов</code> — ИИ-поиск лотов с релевантностью выше 75%\n• <code>/spec 1</code> или <code>/tz 987150-2026</code> — выдает ИИ-резюме ТЗ лота, требования к поставщикам и Риск-Индекс\n• <code>/digest</code> — выборка лучших тендеров под ваш БИН\n• <code>/profile</code> — текущий профиль компании и статус подписки Kaspi Pay`;

    case '/profile':
      if (!profile) {
        return `⚠️ <b>Аккаунт не привязан</b>\n\nВаш Telegram-чат еще не привязан к компании в система TenderAI.\nДля привязки перейдите в веб-интерфейс и нажмите кнопку <b>"Подключить Telegram-бота"</b>.`;
      }
      return `🏢 <b>Профиль компании:</b> ${profile.companyName || 'ТОО "КазИТ Сервис"'}\n` +
        `🔢 <b>БИН:</b> <code>${profile.bin || '180940004512'}</code>\n` +
        `🔑 <b>Ключевые слова:</b> ${profile.keywords?.join(', ') || 'оборудование, ПО, IT'}\n` +
        `📍 <b>Регионы:</b> ${profile.regions?.join(', ') || 'Алматы, Астана'}\n` +
        `💳 <b>Статус подписки:</b> <b style="color:green">PRO (Активна)</b>`;

    case '/digest':
      const topTenders = tenders.slice(0, 3);
      let digestMsg = `📊 <b>Персональный дайджест лотов для вас:</b>\n\n`;
      topTenders.forEach((t, i) => {
        digestMsg += `${i + 1}. <b>${t.title}</b>\n   💰 ${t.amount.toLocaleString('ru-RU')} KZT | 📍 ${t.region}\n   🛡️ Риск: ${t.riskScore}/100 | 🏛️ ${t.customerName}\n\n`;
      });
      digestMsg += `💡 <i>Используйте <code>/spec 1</code> или <code>/spec 2</code> для получения выжимки ТЗ</i>`;
      return digestMsg;

    case '/search':
      const query = args.join(' ').trim();
      if (!query) {
        return `⚠️ Пожалуйста, укажите ключевое слово для поиска.\nПример: <code>/search поставка серверов</code>`;
      }
      const filtered = tenders.filter(t => t.title.toLowerCase().includes(query.toLowerCase()) || t.category.toLowerCase().includes(query.toLowerCase()));
      if (filtered.length === 0) {
        return `🔍 По запросу <b>"${query}"</b> подходящих тендеров не найдено. Нажмите /digest для просмотра популярных лотов.`;
      }
      let searchMsg = `🔍 <b>Результаты поиска по запросу "${query}":</b> (${filtered.length})\n\n`;
      filtered.slice(0, 4).forEach((t, idx) => {
        searchMsg += `${idx + 1}. <b>${t.title}</b>\n   💰 ${t.amount.toLocaleString('ru-RU')} KZT | 📍 ${t.region}\n   🔗 <a href="${t.sourceUrl}">${t.source} #${t.externalId}</a>\n\n`;
      });
      return searchMsg;

    case '/spec':
    case '/tz':
      if (args.length === 0) {
        return `⚠️ Пожалуйста, укажите ID лота или его порядковый номер из последнего поиска.\nПример: <code>/spec 1</code> или <code>/spec 987150-2026</code>`;
      }
      const arg = args[0].trim();
      let targetTender = tenders.find(t => t.id === arg || t.externalId === arg);
      if (!targetTender && /^\d+$/.test(arg)) {
        const index = parseInt(arg, 10) - 1;
        if (index >= 0 && index < tenders.length) {
          targetTender = tenders[index];
        }
      }
      if (!targetTender) {
        targetTender = tenders[0];
      }
      const reqsText = Array.isArray(targetTender.aiKeyRequirements) && targetTender.aiKeyRequirements.length > 0
        ? targetTender.aiKeyRequirements.map((r: string) => `  • ${r}`).join('\n')
        : '  • Наличие лицензий/сертификатов\n  • Опыт работы от 2-х лет';

      return `📄 <b>ИИ-выжимка ТЗ лота #${targetTender.externalId}</b>\n` +
        `<b>${targetTender.title}</b>\n\n` +
        `📝 <b>Краткое резюме:</b>\n${targetTender.aiSummary || 'Техническая спецификация предусматривает комплексную поставку оборудования и оказание сопутствующих услуг с гарантией.'}\n\n` +
        `📋 <b>Ключевые требования:</b>\n${reqsText}\n\n` +
        `🛡️ <b>Риск-индекс:</b> ${targetTender.riskScore}/100\n` +
        `💰 <b>Сумма договора:</b> ${targetTender.amount.toLocaleString('ru-RU')} KZT\n` +
        `🏛️ <b>Заказчик:</b> ${targetTender.customerName}\n` +
        `📍 <b>Регион:</b> ${targetTender.region}\n` +
        `⏳ <b>Дедлайн:</b> ${new Date(targetTender.deadlineDate).toLocaleDateString('ru-RU')}`;

    default:
      return `❓ Неизвестная команда "${command}". Наберите /help для просмотра списка команд.`;
  }
}
