import { Queue, Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { prisma } from '../prisma';
import { GoszakupApiAdapter } from '../ingestion/goszakup.adapter';
import { SamrukApiAdapter } from '../ingestion/samruk.adapter';
import { ConfigurableScraperAdapter } from '../ingestion/scraper.adapter';
import { ScraperSourceConfigData } from '../types/scraper';
import { AIService } from '../services/ai.service';
import { diffTenderFields } from '../ingestion/diff';

import { IngestionProcessorService } from '../services/ingestion-processor.service';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

export const connection = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
  lazyConnect: true
});

export const ingestionQueue = new Queue('ingestion-queue', { connection });

export const createIngestionWorker = () => {
  return new Worker(
    'ingestion-queue',
    async (job: Job) => {
      const { source } = job.data;
      console.log(`[BullMQ Worker] Обработка фоновой задачи инжеста для источника: ${source}`);

      let result: any;
      if (source === 'CHECK_SLA') {
        console.log('[BullMQ Worker] Автоматический запуск проверки SLA и дедлайнов...');
        try {
          const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
          const cronSecret = process.env.CRON_SECRET || process.env.ADMIN_API_KEY || 'internal';
          const res = await fetch(`${appUrl}/api/notifications/check-sla`, {
            headers: { 'X-Cron-Secret': cronSecret }
          });
          result = await res.json();
        } catch (err: any) {
          console.warn('[BullMQ Worker] Сбой автономного вызова check-sla:', err?.message);
          result = { success: false, error: err?.message };
        }
      } else if (source === 'CHECK_MATCHES') {
        console.log('[BullMQ Worker] Автоматический запуск ИИ-матчинга новых лотов по профилям...');
        try {
          const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
          const cronSecret = process.env.CRON_SECRET || process.env.ADMIN_API_KEY || 'internal';
          const res = await fetch(`${appUrl}/api/notifications/check-matches`, {
            headers: { 'X-Cron-Secret': cronSecret }
          });
          result = await res.json();
        } catch (err: any) {
          console.warn('[BullMQ Worker] Сбой автономного вызова check-matches:', err?.message);
          result = { success: false, error: err?.message };
        }
      } else if (source === 'GOSZAKUP') {
        const adapter = new GoszakupApiAdapter();
        result = await adapter.run();
      } else if (source === 'SAMRUK_KAZYNA') {
        const adapter = new SamrukApiAdapter();
        result = await adapter.run();
      } else {
        // Check if source is a Scraper source in Prisma DB
        const dbSource = await prisma.dataSource.findFirst({
          where: {
            OR: [{ name: source }, { id: source }]
          },
          include: { scraperConfig: true }
        });

        if (dbSource && dbSource.adapterType === 'SCRAPER' && dbSource.scraperConfig) {
          const configData: ScraperSourceConfigData = {
            dataSourceId: dbSource.name || dbSource.id,
            renderMode: dbSource.scraperConfig.renderMode as any,
            listUrlTemplate: dbSource.scraperConfig.listUrlTemplate,
            pagination: dbSource.scraperConfig.pagination as any,
            listItemSelector: dbSource.scraperConfig.listItemSelector,
            fields: dbSource.scraperConfig.fields as any,
            detailPage: dbSource.scraperConfig.detailPage as any,
            respectRobotsTxt: dbSource.scraperConfig.respectRobotsTxt,
            active: dbSource.scraperConfig.active
          };
          const adapter = new ConfigurableScraperAdapter(configData);
          result = await adapter.run();
        } else {
          throw new Error(`Неизвестный или неопределенный источник инжеста: ${source}`);
        }
      }

      // Persist tenders into DB using unified IngestionProcessorService
      if (result && result.status !== 'ERROR' && Array.isArray(result.tenders) && result.tenders.length > 0) {
        await IngestionProcessorService.processIngestedTenders(result.tenders);
      }

      return result;
    },
    { connection }
  );
};

/**
 * Schedule recurring background ingestion jobs and SLA check job according to checkIntervalMins
 */
export async function scheduleAllActiveSources(): Promise<number> {
  try {
    const activeSources = await prisma.dataSource.findMany({
      where: { isActive: true }
    });

    let scheduledCount = 0;
    for (const src of activeSources) {
      const repeatEveryMs = (src.checkIntervalMins || 15) * 60 * 1000;
      await ingestionQueue.add(
        `ingest-${src.name}`,
        { source: src.name },
        {
          repeat: { every: repeatEveryMs },
          jobId: `repeat-${src.name}`
        }
      );
      scheduledCount++;
    }

    // Schedule hourly SLA & Urgent Deadline checker job
    await ingestionQueue.add(
      'ingest-CHECK_SLA',
      { source: 'CHECK_SLA' },
      {
        repeat: { every: 60 * 60 * 1000 },
        jobId: 'repeat-CHECK_SLA'
      }
    );
    scheduledCount++;

    // Schedule hourly AI Profile Matching notification checker job
    await ingestionQueue.add(
      'ingest-CHECK_MATCHES',
      { source: 'CHECK_MATCHES' },
      {
        repeat: { every: 60 * 60 * 1000 },
        jobId: 'repeat-CHECK_MATCHES'
      }
    );
    scheduledCount++;

    console.log(`[BullMQ Scheduler] Успешно запланировано ${scheduledCount} задач инжеста, SLA и ИИ-матчинга по расписанию`);
    return scheduledCount;
  } catch (err: any) {
    console.warn('[BullMQ Scheduler] Ошибка планирования очередей:', err?.message);
    return 0;
  }
}
