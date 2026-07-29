import { Queue, Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { GoszakupApiAdapter } from '../ingestion/goszakup.adapter';
import { SamrukApiAdapter } from '../ingestion/samruk.adapter';
import { ConfigurableScraperAdapter } from '../ingestion/scraper.adapter';
import { ScraperSourceConfigData } from '../types/scraper';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const prisma = new PrismaClient();

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

      if (source === 'GOSZAKUP') {
        const adapter = new GoszakupApiAdapter();
        return await adapter.run();
      } else if (source === 'SAMRUK_KAZYNA') {
        const adapter = new SamrukApiAdapter();
        return await adapter.run();
      }

      // Check if source is a Scraper source in Prisma DB
      const dbSource = await prisma.dataSource.findFirst({
        where: {
          OR: [{ name: source }, { id: source }]
        },
        include: { scraperConfig: true }
      });

      if (dbSource && dbSource.adapterType === 'SCRAPER' && dbSource.scraperConfig) {
        const configData: ScraperSourceConfigData = {
          dataSourceId: dbSource.id,
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
        return await adapter.run();
      }

      throw new Error(`Неизвестный или неопределенный источник инжеста: ${source}`);
    },
    { connection }
  );
};

/**
 * Schedule recurring background ingestion jobs for all active sources according to checkIntervalMins
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

    console.log(`[BullMQ Scheduler] Успешно запланировано ${scheduledCount} источников данных по расписанию`);
    return scheduledCount;
  } catch (err: any) {
    console.warn('[BullMQ Scheduler] Ошибка планирования очередей:', err?.message);
    return 0;
  }
}
