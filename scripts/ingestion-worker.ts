import { createIngestionWorker, scheduleAllActiveSources, connection } from '../src/lib/queue/ingestion.queue';
import { createComplianceWorker, complianceConnection } from '../src/lib/queue/compliance.queue';
import { prisma } from '../src/lib/prisma';

async function main() {
  console.log('🚀 [Worker] Запуск фоновых BullMQ воркеров (инжест + проверка соответствия ТЗ)...');

  // 1. Инициализация Ingestion Worker
  const ingestionWorker = createIngestionWorker();
  const complianceWorker = createComplianceWorker();

  ingestionWorker.on('ready', () => {
    console.log('✅ [Worker] Ingestion Worker успешно подключился к Redis');
  });

  complianceWorker.on('ready', () => {
    console.log('✅ [Worker] Compliance Worker успешно подключился к Redis');
  });

  complianceWorker.on('active', (job) => {
    console.log(`⏳ [Compliance Worker] Старт задачи #${job.id} для проверки #${job.data?.checkId}`);
  });

  complianceWorker.on('completed', (job) => {
    console.log(`✅ [Compliance Worker] Задача #${job.id} для проверки #${job.data?.checkId} успешно завершена`);
  });

  complianceWorker.on('failed', (job, err) => {
    console.error(`❌ [Compliance Worker] Ошибка задачи #${job?.id}:`, err?.message || err);
  });

  ingestionWorker.on('active', (job) => {
    console.log(`⏳ [Worker] Старт выполнения задачи #${job.id} (${job.name}) для источника: ${job.data?.source}`);
  });

  ingestionWorker.on('completed', (job, result) => {
    console.log(`✅ [Worker] Задача #${job.id} (${job.name}) успешно завершена. Получено элементов: ${result?.itemsFetched || 0}`);
  });

  // Игнорируем разовые ошибки отдельных задач - логируем и продолжаем слушать очередь
  ingestionWorker.on('failed', (job, err) => {
    console.error(`❌ [Worker] Ошибка при выполнении задачи #${job?.id} (${job?.name}):`, err?.message || err);
  });

  ingestionWorker.on('error', (err) => {
    console.error('❌ [Worker] Ошибка работы BullMQ воркера:', err);
  });

  // 2. Планирование регулярных задач для всех активных источников БД
  const scheduledCount = await scheduleAllActiveSources();
  console.log(`📅 [Worker] Запланировано ${scheduledCount} активных источников данных по их checkIntervalMins`);

  // 3. Graceful Shutdown
  const gracefulShutdown = async (signal: string) => {
    console.log(`\n🛑 [Worker] Получен сигнал ${signal}. Завершение работы воркеров...`);
    try {
      await ingestionWorker.close();
      await complianceWorker.close();
      console.log('✅ [Worker] BullMQ Workers остановлены');
      await connection.quit();
      await complianceConnection.quit();
      console.log('✅ [Worker] Соединения с Redis закрыты');
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

