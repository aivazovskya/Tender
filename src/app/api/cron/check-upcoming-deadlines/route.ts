import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { TelegramBotService } from '@/lib/services/telegram.service';

export async function GET(request: NextRequest) {
  return handleCronJob(request);
}

export async function POST(request: NextRequest) {
  return handleCronJob(request);
}

async function handleCronJob(request: NextRequest) {
  try {
    const authHeader = request.headers.get('x-cron-secret') || request.headers.get('X-Cron-Secret');
    const { searchParams } = new URL(request.url);
    const secretQuery = searchParams.get('cronSecret') || searchParams.get('secret');

    const cronSecret = process.env.CRON_SECRET || 'tender-cron-secret-key';
    const providedSecret = authHeader || secretQuery;

    if (!providedSecret || providedSecret !== cronSecret) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized: Invalid X-Cron-Secret header or query secret' },
        { status: 401 }
      );
    }

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    let pendingDeadlines: any[] = [];
    try {
      pendingDeadlines = await prisma.tenderDeadline.findMany({
        where: {
          status: 'PENDING'
        },
        include: {
          tender: true,
          companyProfile: true
        }
      });
    } catch {
      pendingDeadlines = [];
    }

    let notificationsSent = 0;
    let missedCount = 0;

    for (const d of pendingDeadlines) {
      const dueAt = new Date(d.dueAt);
      const hoursRemaining = (dueAt.getTime() - now.getTime()) / (1000 * 60 * 60);
      const daysRemaining = Math.ceil(hoursRemaining / 24);

      // 1. Mark missed deadlines if dueAt < now
      if (hoursRemaining < 0) {
        try {
          await prisma.tenderDeadline.update({
            where: { id: d.id },
            data: { status: 'MISSED' }
          });
        } catch {
          d.status = 'MISSED';
        }
        missedCount++;
        continue;
      }

      // 2. Notification rules: 3 days before, 1 day before, or 0 days before (day of deadline)
      const is3DaysBefore = daysRemaining === 3;
      const is1DayBefore = daysRemaining === 1;
      const isDayOfDeadline = hoursRemaining <= 12 && hoursRemaining >= 0;

      const shouldNotify = is3DaysBefore || is1DayBefore || isDayOfDeadline;

      // 3. Deduplication guard: skip if notified today
      const alreadyNotifiedToday = d.notifiedAt && new Date(d.notifiedAt).toISOString().slice(0, 10) === todayStr;

      if (shouldNotify && !alreadyNotifiedToday) {
        const tender = d.tender || {
          externalId: d.tenderId,
          title: 'Тендер',
          amount: 0,
          customerName: 'Заказчик',
          customerBin: '',
          region: 'РК',
          deadlineDate: dueAt,
          riskScore: 0,
          sourceUrl: 'https://goszakup.gov.kz',
          source: 'Госзакуп'
        };

        const chatId = d.companyProfile?.telegramChatId || process.env.TELEGRAM_DEFAULT_CHAT_ID;
        let timingText = `${daysRemaining} дн.`;
        if (isDayOfDeadline) timingText = 'Сегодня!';
        else if (is1DayBefore) timingText = 'Завтра!';

        const deadlineTypeLabels: Record<string, string> = {
          SUBMISSION_DEADLINE: 'Окончание приёма заявок',
          CLARIFICATION_DEADLINE: 'Срок запроса разъяснений',
          SECURITY_DEPOSIT_DEADLINE: 'Срок обеспечения заявки',
          APPEAL_DEADLINE: 'Срок подачи жалобы',
          CONTRACT_SIGNING_DEADLINE: 'Срок подписания контракта',
          CUSTOM: 'Пользовательский дедлайн'
        };

        const typeLabel = deadlineTypeLabels[d.type] || d.type;

        const customMessage =
          `⏰ <b>НАПОМИНАНИЕ О ДЕДЛАЙНЕ (${timingText})</b>\n\n` +
          `📌 Тип: <b>${typeLabel}</b> ${d.title ? `(${d.title})` : ''}\n` +
          `📋 Тендер: <b>${tender.title}</b>\n` +
          `💰 Сумма: <b>${Number(tender.amount || 0).toLocaleString('ru-RU')} KZT</b>\n` +
          `🏛️ Заказчик: ${tender.customerName}\n` +
          `⏳ Точное время: <b>${dueAt.toLocaleString('ru-RU')}</b>\n\n` +
          `🔗 <a href="${tender.sourceUrl || '#'}">Перейти к закупке</a>`;

        const notifyResult = await TelegramBotService.sendNotification(
          tender as any,
          chatId,
          customMessage
        );

        if (notifyResult.success || notifyResult.skipped) {
          try {
            await prisma.tenderDeadline.update({
              where: { id: d.id },
              data: { notifiedAt: now }
            });
          } catch {
            d.notifiedAt = now;
          }
          notificationsSent++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `Дедлайн-крон успешно выполнен`,
      processedCount: pendingDeadlines.length,
      notificationsSent,
      missedCount
    });
  } catch (error: any) {
    console.error('[API /api/cron/check-upcoming-deadlines Error]:', error?.message);
    return NextResponse.json(
      { success: false, message: error?.message || 'Ошибка выполнения крон-задачи дедлайнов' },
      { status: 500 }
    );
  }
}
