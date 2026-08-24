import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { TelegramBotService } from '@/lib/services/telegram.service';
import { validateApiAuth } from '@/lib/security/auth';

export async function GET(request: NextRequest) {
  const cronSecretHeader = request.headers.get('x-cron-secret') || request.headers.get('X-Cron-Secret');
  const authHeader = request.headers.get('authorization') || request.headers.get('Authorization');
  let bearerToken = '';
  if (authHeader && authHeader.startsWith('Bearer ')) {
    bearerToken = authHeader.substring(7).trim();
  }

  const token = cronSecretHeader || bearerToken;
  const expectedSecret = process.env.CRON_SECRET || process.env.ADMIN_API_KEY;
  const isProd = process.env.NODE_ENV === 'production';

  if ((expectedSecret || isProd) && token !== expectedSecret) {
    const auth = await validateApiAuth(request, 'ADMIN');
    if (!auth.authorized && auth.response) {
      return auth.response;
    }
  }

  try {
    const now = new Date();
    const targetDate = new Date();
    targetDate.setDate(now.getDate() + 7);

    // Find active security instruments expiring within 7 days
    let expiringInstruments: any[] = [];
    try {
      expiringInstruments = await prisma.securityInstrument.findMany({
        where: {
          status: 'ACTIVE',
          expiryDate: {
            gte: now,
            lte: targetDate
          }
        },
        include: {
          tender: { select: { title: true, externalId: true, amount: true } },
          companyProfile: { select: { companyName: true, telegramChatId: true } }
        }
      });
    } catch (dbErr) {
      expiringInstruments = [];
    }

    let notificationsSent = 0;
    const todayStr = now.toISOString().split('T')[0];

    for (const inst of expiringInstruments) {
      // Check if reminder was already sent today
      if (inst.lastReminderSentAt) {
        const lastSentStr = new Date(inst.lastReminderSentAt).toISOString().split('T')[0];
        if (lastSentStr === todayStr) {
          continue; // Skip, already notified today
        }
      }

      const daysRemaining = Math.ceil((new Date(inst.expiryDate).getTime() - now.getTime()) / (1000 * 3600 * 24));
      const typeText = inst.type.includes('BANK_GUARANTEE') ? 'Банковская гарантия' : 'Депозит';
      const amountStr = Number(inst.amount).toLocaleString('ru-RU');

      const message = `⚠️ *Напоминание о сроке действия обеспечения* ⚠️\n\n` +
        `📋 *Тендер:* ${inst.tender.title} (Лот №${inst.tender.externalId})\n` +
        `💵 *Сумма:* ${amountStr} ₸\n` +
        `🛡️ *Тип:* ${typeText}\n` +
        `⏳ *Срок истекает через:* ${daysRemaining} дн. (${new Date(inst.expiryDate).toLocaleDateString('ru-RU')})\n\n` +
        `Пожалуйста, проверьте статус и возможность возврата/продления в реестре обеспечений.`;

      const chatId = inst.companyProfile?.telegramChatId || process.env.TELEGRAM_CHAT_ID;
      if (chatId) {
        try {
          await TelegramBotService.sendNotification(inst.tender as any, chatId, message);
          notificationsSent++;
        } catch (tgErr) {
          console.error(`[Security Expiry Cron] Failed to send Telegram alert to chatId ${chatId}:`, tgErr);
        }
      }

      // Update lastReminderSentAt flag to prevent spam
      await prisma.securityInstrument.update({
        where: { id: inst.id },
        data: { lastReminderSentAt: new Date() }
      });
    }

    return NextResponse.json({
      success: true,
      expiringFound: expiringInstruments.length,
      notificationsSent
    });
  } catch (error: any) {
    console.error('[API /api/notifications/check-security-expiry Error]:', error?.message);
    return NextResponse.json(
      { success: false, message: error?.message || 'Ошибка проверки истечения обеспечений' },
      { status: 500 }
    );
  }
}
