import { Tender, SourceType, AdapterType } from '../types/tender';

export interface IngestionResult {
  source: SourceType;
  adapterType: AdapterType;
  itemsFetched: number;
  itemsNormalized: number;
  durationMs: number;
  status: 'SUCCESS' | 'WARN' | 'ERROR';
  message: string;
  tenders: Tender[];
}

/**
 * Token Bucket & Exponential Backoff Rate Limiter for external Kazakhstani procurement APIs
 */
export class RateLimiter {
  private lastRequestTime = 0;

  constructor(
    private minIntervalMs: number = 500, // Max 2 requests per second
    private maxRetries: number = 3
  ) {}

  async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < this.minIntervalMs) {
      await new Promise((resolve) => setTimeout(resolve, this.minIntervalMs - elapsed));
    }
    this.lastRequestTime = Date.now();
  }

  async executeWithBackoff<T>(fn: () => Promise<T>): Promise<T> {
    let attempt = 0;
    while (true) {
      try {
        await this.enforceRateLimit();
        return await fn();
      } catch (error: any) {
        attempt++;
        const isRateLimited = error?.status === 429 || error?.statusCode === 429;
        const isServerError = error?.status >= 500;

        if ((isRateLimited || isServerError) && attempt <= this.maxRetries) {
          const backoffDelay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
          console.warn(`[RateLimiter] Внешний источник вернул ${error?.status || 429}. Пауза ${backoffDelay}ms (попытка ${attempt}/${this.maxRetries})...`);
          await new Promise((resolve) => setTimeout(resolve, backoffDelay));
        } else {
          throw error;
        }
      }
    }
  }
}

export abstract class BaseTenderAdapter {
  protected abstract sourceType: SourceType;
  protected abstract adapterType: AdapterType;
  protected rateLimiter: RateLimiter = new RateLimiter(500, 3);

  /**
   * Fetch raw data from API or web scraper
   */
  abstract fetchRawData(): Promise<any[]>;

  /**
   * Normalize raw data to unified Tender structure
   */
  abstract normalize(rawData: any[]): Tender[];

  /**
   * Execute full ingestion pipeline with real rate limiting, backoff and logging
   */
  async run(): Promise<IngestionResult> {
    const startTime = Date.now();
    try {
      // Execute fetch with rate limiting and exponential backoff protection
      const raw = await this.rateLimiter.executeWithBackoff(() => this.fetchRawData());
      const normalized = this.normalize(raw);
      const durationMs = Date.now() - startTime;

      return {
        source: this.sourceType,
        adapterType: this.adapterType,
        itemsFetched: raw.length,
        itemsNormalized: normalized.length,
        durationMs,
        status: 'SUCCESS',
        message: `Успешно обработано ${normalized.length} лотов из ${this.sourceType}`,
        tenders: normalized,
      };
    } catch (error: any) {
      const durationMs = Date.now() - startTime;
      return {
        source: this.sourceType,
        adapterType: this.adapterType,
        itemsFetched: 0,
        itemsNormalized: 0,
        durationMs,
        status: 'ERROR',
        message: `Сбой при получении данных: ${error?.message || 'Неизвестная ошибка'}`,
        tenders: [],
      };
    }
  }
}
