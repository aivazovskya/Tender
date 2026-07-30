import { createIngestionWorker, scheduleAllActiveSources, connection } from '../src/lib/queue/ingestion.queue';
import { prisma } from '../src/lib/prisma';

async function main() {
  console.log('🚀 [Worker] Запуск фонового BullMQ воркера инжеста тендеров...');

  // 1. Инициализация BullMQ Worker
  const worker = createIngestionWorker();

  worker.on('ready', () => {
    console.log('✅ [Worker] Воркер успешно подключился к Redis и готов принимать задачи');
  });

  worker.on('active', (job) => {
    console.log(`⏳ [Worker] Старт выполнения задачи #${job.id} (${job.name}) для источника: ${job.data?.source}`);
  });

  worker.on('completed', (job, result) => {
    console.log(`✅ [Worker] Задача #${job.id} (${job.name}) успешно завершена. Получено элементов: ${result?.itemsFetched || 0}`);
  });

  // Игнорируем разовые ошибки отдельных задач - логируем и продолжаем слушать очередь
  worker.on('failed', (job, err) => {
    console.error(`❌ [Worker] Ошибка при выполнении задачи #${job?.id} (${job?.name}):`, err?.message || err);
  });

  worker.on('error', (err) => {
    console.error('❌ [Worker] Ошибка работы BullMQ воркера:', err);
  });

  // 2. Планирование регулярных задач для всех активных источников БД
  const scheduledCount = await scheduleAllActiveSources();
  console.log(`📅 [Worker] Запланировано ${scheduledCount} активных источников данных по их checkIntervalMins`);

  // 3. Graceful Shutdown
  const gracefulShutdown = async (signal: string) => {
    console.log(`\n🛑 [Worker] Получен сигнал ${signal}. Завершение работы воркера...`);
    try {
      await worker.close();
      console.log('✅ [Worker] BullMQ Worker остановлен');
      await connection.quit();
      console.log('✅ [Worker] Соединение с Redis закрыто');
      await prisma.$disconnect();
      console.log('✅ [Worker] Соединение с Prisma DB закрыто');
      process.exit(0);
    } catch (err) {
      console.error('❌ [Worker] Ошибка при graceful shutdown:', err);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

main().catch((err) => {
  console.error('💥 [Worker] Крах процесса воркера при запуске:', err);
  process.exit(1);
});
