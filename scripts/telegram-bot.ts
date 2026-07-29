import { createTelegrafBot } from '../src/lib/telegram/bot.runner';

async function main() {
  console.log('🤖 [Telegram Bot] Запуск сервиса Telegram-бота TenderAI...');

  const bot = createTelegrafBot();

  if (!bot) {
    console.warn('⚠️ [Telegram Bot] TELEGRAM_BOT_TOKEN не настроен или содержит плейсхолдер. Сервис находится в режиме ожидания.');
    // Keep process alive so container doesn't restart repeatedly if token is not yet configured
    setInterval(() => {}, 60000);
    return;
  }

  try {
    await bot.launch();
    console.log('✅ [Telegram Bot] Интерактивный бот TenderAI успешно запущен и слушаeт сообщения (Long Polling)!');

    const gracefulShutdown = (signal: string) => {
      console.log(`\n🛑 [Telegram Bot] Получен сигнал ${signal}. Остановка Telegram бота...`);
      try {
        bot.stop(signal);
        console.log('✅ [Telegram Bot] Бот успешно остановлен.');
        process.exit(0);
      } catch (err) {
        console.error('❌ [Telegram Bot] Ошибка при остановке бота:', err);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  } catch (err: any) {
    console.error('💥 [Telegram Bot] Крах при запуске Telegram-бота:', err?.message || err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('💥 [Telegram Bot] Фатальная ошибка бота:', err);
  process.exit(1);
});
