import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateApiAuth } from '@/lib/security/auth';
import { TelegramBotService } from '@/lib/services/telegram.service';

export async function POST(request: NextRequest) {
  const auth = await validateApiAuth(request);
  if (!auth.authorized && auth.response) return auth.response;

  try {
    const { tenderId } = await request.json();
    if (!tenderId) {
      return NextResponse.json({ success: false, message: 'tenderId обязателен' }, { status: 400 });
    }

    const tender = await prisma.tender.findFirst({
      where: {
        OR: [
          { id: tenderId },
          { externalId: String(tenderId) }
        ]
      }
    });

    if (!tender) {
      return NextResponse.json({ success: false, message: 'Лот не найден' }, { status: 404 });
    }

    const profile = await prisma.companyProfile.findFirst({ where: { userId: auth.userId } });
    const result = await TelegramBotService.sendNotification(
      tender as any,
      profile?.telegramChatId || undefined
    );

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[API /api/telegram/notify Error]:', error?.message);
    return NextResponse.json(
      { success: false, message: error?.message || 'Ошибка отправки уведомления' },
      { status: 500 }
    );
  }
}
