import { Queue, Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { ComplianceProcessorService } from '../services/compliance-processor.service';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

export const complianceConnection = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
  lazyConnect: true,
  enableOfflineQueue: false
});

export const complianceQueue = new Queue('compliance-queue', {
  connection: complianceConnection as any
});

export interface ComplianceJobData {
  checkId: string;
  fileBufferBase64?: string;
}

/**
 * Process a single compliance check BullMQ job
 */
export async function processComplianceJob(jobData: ComplianceJobData) {
  const { checkId, fileBufferBase64 } = jobData;
  console.log(`[Compliance Worker] Старт обработки фоновой задачи для проверки #${checkId}`);

  const fileBuffer = fileBufferBase64 ? Buffer.from(fileBufferBase64, 'base64') : undefined;
  return await ComplianceProcessorService.processComplianceCheck(checkId, fileBuffer);
}

/**
 * Create a BullMQ worker for the compliance queue
 */
export const createComplianceWorker = () => {
  return new Worker(
    'compliance-queue',
    async (job: Job<ComplianceJobData>) => {
      return await processComplianceJob(job.data);
    },
    { connection: complianceConnection as any }
  );
};

/**
 * Safe helper to enqueue a compliance check.
 * Tries BullMQ first; falls back to in-process async processing if Redis is unavailable.
 */
export async function enqueueComplianceCheck(params: {
  checkId: string;
  fileBuffer?: Buffer;
}): Promise<void> {
  const { checkId, fileBuffer } = params;
  const fileBufferBase64 = fileBuffer ? fileBuffer.toString('base64') : undefined;

  let enqueuedViaBullMQ = false;

  try {
    // Only attempt Redis queue if not in memory test mode
    if (process.env.AUTH_STORE_MODE !== 'memory') {
      await complianceQueue.add(
        `compliance-${checkId}`,
        { checkId, fileBufferBase64 },
        {
          jobId: `comp-${checkId}`,
          removeOnComplete: true,
          removeOnFail: false
        }
      );
      enqueuedViaBullMQ = true;
    }
  } catch (err: any) {
    console.warn(`[ComplianceQueue] BullMQ недоступен (${err?.message}), переключение на автономный async-воркер.`);
  }

  // If BullMQ enqueue failed or in memory/offline mode, process asynchronously in background
  if (!enqueuedViaBullMQ) {
    setImmediate(async () => {
      try {
        await ComplianceProcessorService.processComplianceCheck(checkId, fileBuffer);
      } catch (err) {
        console.error(`[Compliance In-Process Async Worker] Ошибка обработки проверки #${checkId}:`, err);
      }
    });
  }
}
