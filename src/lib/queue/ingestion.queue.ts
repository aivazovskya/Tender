import { Queue, Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { prisma } from '../prisma';
import { getApiAdapter } from '../ingestion/adapter-registry';
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

/**
 * Process single ingestion background job payload
 */
export async function processIngestionJob(jobData: { source: string }) {
  const { source } = jobData;
  console.log(`[BullMQ Worker] Обработка фоновой задачи инжеста для источника: ${source}`);

  let result: any;
  if (source === 'CHECK_SLA') {
    console.log('[BullMQ Worker] Автоматический запуск проверки SLA и дедлайнов...');
    try {
      const appUrl = process.env.INTERNAL_APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
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
      const appUrl = process.env.INTERNAL_APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      const cronSecret = process.env.CRON_SECRET || process.env.ADMIN_API_KEY || 'internal';
      const res = await fetch(`${appUrl}/api/notifications/check-matches`, {
        headers: { 'X-Cron-Secret': cronSecret }
      });
      result = await res.json();
    } catch (err: any) {
      console.warn('[BullMQ Worker] Сбой автономного вызова check-matches:', err?.message);
      result = { success: false, error: err?.message };
    }
  } else if (source === 'CHECK_HEALTH') {
    console.log('[BullMQ Worker] Автоматический запуск проверки активности источников (Ingestion Health)...');
    try {
      const appUrl = process.env.INTERNAL_APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      const cronSecret = process.env.CRON_SECRET || process.env.ADMIN_API_KEY || 'internal';
      const res = await fetch(`${appUrl}/api/cron/health-check`, {
        headers: { 'X-Cron-Secret': cronSecret }
      });
      result = await res.json();
    } catch (err: any) {
      console.warn('[BullMQ Worker] Сбой автономного вызова health-check:', err?.message);
      result = { success: false, error: err?.message };
    }
  } else if (source === 'CHECK_SECURITY_EXPIRY') {
    console.log('[BullMQ Worker] Автоматический запуск проверки истекающих обеспечений...');
    try {
      const appUrl = process.env.INTERNAL_APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      const cronSecret = process.env.CRON_SECRET || process.env.ADMIN_API_KEY || 'internal';
      const res = await fetch(`${appUrl}/api/notifications/check-security-expiry`, {
        headers: { 'X-Cron-Secret': cronSecret }
      });
      result = await res.json();
    } catch (err: any) {
      console.warn('[BullMQ Worker] Сбой автономного вызова check-security-expiry:', err?.message);
      result = { success: false, error: err?.message };
    }
  } else if (source === 'CHECK_UPCOMING_DEADLINES') {
    console.log('[BullMQ Worker] Автоматический запуск проверки приближающихся дедлайнов...');
    try {
      const appUrl = process.env.INTERNAL_APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      const cronSecret = process.env.CRON_SECRET || process.env.ADMIN_API_KEY || 'internal';
      const res = await fetch(`${appUrl}/api/cron/check-upcoming-deadlines`, {
        headers: { 'X-Cron-Secret': cronSecret }
      });
      result = await res.json();
    } catch (err: any) {
      console.warn('[BullMQ Worker] Сбой автономного вызова check-upcoming-deadlines:', err?.message);
      result = { success: false, error: err?.message };
    }
  } else if (source === 'CHECK_SUBMITTED_RESULTS') {
    console.log('[BullMQ Worker] Автоматический запуск проверки результатов поданных заявок...');
    try {
      const appUrl = process.env.INTERNAL_APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      const cronSecret = process.env.CRON_SECRET || process.env.ADMIN_API_KEY || 'internal';
      const res = await fetch(`${appUrl}/api/cron/check-submitted-tender-results`, {
        headers: { 'X-Cron-Secret': cronSecret }
      });
      result = await res.json();
    } catch (err: any) {
      console.warn('[BullMQ Worker] Сбой автономного вызова check-submitted-tender-results:', err?.message);
      result = { success: false, error: err?.message };
    }
  } else {
    const apiAdapter = getApiAdapter(source);
    if (apiAdapter) {
      result = await apiAdapter.run();
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
  }

  // Persist tenders into DB using unified IngestionProcessorService
  if (result && result.status !== 'ERROR' && Array.isArray(result.tenders) && result.tenders.length > 0) {
    await IngestionProcessorService.processIngestedTenders(result.tenders);
  }

  return result;
}

export const createIngestionWorker = () => {
  return new Worker(
    'ingestion-queue',
    async (job: Job) => {
      return await processIngestionJob(job.data);
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

    // Schedule hourly Ingestion Health checker job
    await ingestionQueue.add(
      'ingest-CHECK_HEALTH',
      { source: 'CHECK_HEALTH' },
      {
        repeat: { every: 60 * 60 * 1000 },
        jobId: 'repeat-CHECK_HEALTH'
      }
    );
    scheduledCount++;

    // Schedule daily Security Expiry checker job (08:00)
    await ingestionQueue.add(
      'ingest-CHECK_SECURITY_EXPIRY',
      { source: 'CHECK_SECURITY_EXPIRY' },
      {
        repeat: { pattern: '0 8 * * *' },
        jobId: 'repeat-CHECK_SECURITY_EXPIRY'
      }
    );
    scheduledCount++;

    // Schedule Upcoming Deadlines checker job (07:00 & 19:00)
    await ingestionQueue.add(
      'ingest-CHECK_UPCOMING_DEADLINES',
      { source: 'CHECK_UPCOMING_DEADLINES' },
      {
        repeat: { pattern: '0 7,19 * * *' },
        jobId: 'repeat-CHECK_UPCOMING_DEADLINES'
      }
    );
    scheduledCount++;

    // Schedule Submitted Results checker job (06:00 & 18:00)
    await ingestionQueue.add(
      'ingest-CHECK_SUBMITTED_RESULTS',
      { source: 'CHECK_SUBMITTED_RESULTS' },
      {
        repeat: { pattern: '0 6,18 * * *' },
        jobId: 'repeat-CHECK_SUBMITTED_RESULTS'
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
