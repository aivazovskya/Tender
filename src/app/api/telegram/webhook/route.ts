import { NextRequest, NextResponse } from 'next/server';
import { TelegrafBotService } from '@/lib/telegram/bot.service';

export async function POST(req: NextRequest) {
  try {
    const bot = await TelegrafBotService.initBot();
    if (!bot) {
      return NextResponse.json({ success: false, message: 'Telegram Bot is not configured' }, { status: 503 });
    }

    const body = await req.json();
    await bot.handleUpdate(body);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Telegram Webhook Error]:', error);
    return NextResponse.json({ success: false, error: error?.message || 'Internal Server Error' }, { status: 500 });
  }
}
