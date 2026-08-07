import { prisma } from '../prisma';
import { GoszakupApiAdapter } from '../ingestion/goszakup.adapter';
import { RateLimiter } from '../ingestion/base.adapter';
import { ReputationService, ReputationCheckResult } from './reputation.service';

export interface CustomerInternalStats {
  customerBin: string;
  customerName: string | null;
  totalTendersCount: number;
  totalAmountSum: number;
  avgAmount: number;
  medianAmount: number;
  categoryBreakdown: Record<string, { count: number; percent: number }>;
  industryTagsBreakdown: Record<string, { count: number }>;
  regionBreakdown: Record<string, { count: number; percent: number }>;
  procurementMethodBreakdown: Record<string, { count: number; percent: number }>;
  avgDaysBetweenTenders: number | null;
}

export interface CustomerWinnerEntry {
  winnerBin: string | null;
  winnerName: string | null;
  tenderCount: number;
  sampleSize: number;
  checkedAt: string;
}

export interface CustomerWinnersResult {
  customerBin: string;
  winners: CustomerWinnerEntry[];
  sampleSize: number;
  cached: boolean;
}

// In-memory fallback cache for environments without DB connection
const memoryWinnerCache = new Map<string, { expiresAt: Date; data: CustomerWinnerEntry[] }>();
// Dedicated rate limiter for Customer Analytics winner lookups to avoid throttling ReputationService
const analyticsWinnerRateLimiter = new RateLimiter(500, 3);

export class CustomerAnalyticsService {
  /**
   * Section 2.1: Computes 12-month internal procurement statistics from platform DB
   */
  static async getInternalCustomerStats(customerBin: string): Promise<CustomerInternalStats> {
    const cleanBin = (customerBin || '').trim();

    if (!ReputationService.isValidBin(cleanBin)) {
      throw new Error('Некорректный формат БИН/ИИН. Ожидается ровно 12 цифр.');
    }

    const now = new Date();
    const cutoffDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());

    let tenders: any[] = [];
    try {
      tenders = await (prisma as any).tender.findMany({
        where: {
          customerBin: cleanBin,
          publishDate: {
            gte: cutoffDate
          }
        },
        orderBy: {
          publishDate: 'desc'
        }
      });
    } catch (err: any) {
      console.warn(`[CustomerAnalyticsService] DB query failed for customerBin ${cleanBin}:`, err?.message);
    }

    const totalTendersCount = tenders.length;

    if (totalTendersCount === 0) {
      return {
        customerBin: cleanBin,
        customerName: null,
        totalTendersCount: 0,
        totalAmountSum: 0,
        avgAmount: 0,
        medianAmount: 0,
        categoryBreakdown: {},
        industryTagsBreakdown: {},
        regionBreakdown: {},
        procurementMethodBreakdown: {},
        avgDaysBetweenTenders: null
      };
    }

    const customerName = tenders[0]?.customerName || null;
    const amounts = tenders.map((t) => Number(t.amount || 0));
    const totalAmountSum = amounts.reduce((sum, a) => sum + a, 0);
    const avgAmount = Math.round(totalAmountSum / totalTendersCount);

    // Median calculation
    const sortedAmounts = [...amounts].sort((a, b) => a - b);
    let medianAmount = 0;
    const mid = Math.floor(sortedAmounts.length / 2);
    if (sortedAmounts.length % 2 === 0) {
      medianAmount = Math.round((sortedAmounts[mid - 1] + sortedAmounts[mid]) / 2);
    } else {
      medianAmount = Math.round(sortedAmounts[mid]);
    }

    // Category Breakdown
    const categoryCounts: Record<string, number> = {};
    for (const t of tenders) {
      const cat = t.category || 'Прочее';
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    }
    const categoryBreakdown: Record<string, { count: number; percent: number }> = {};
    for (const [cat, count] of Object.entries(categoryCounts)) {
      categoryBreakdown[cat] = {
        count,
        percent: Math.round((count / totalTendersCount) * 100)
      };
    }

    // Industry Tags Breakdown
    const industryTagsBreakdown: Record<string, { count: number }> = {};
    for (const t of tenders) {
      if (Array.isArray(t.industryTags)) {
        for (const tag of t.industryTags) {
          if (tag) {
            industryTagsBreakdown[tag] = {
              count: (industryTagsBreakdown[tag]?.count || 0) + 1
            };
          }
        }
      }
    }

    // Region Breakdown
    const regionCounts: Record<string, number> = {};
    for (const t of tenders) {
      const reg = t.region || 'Не указан';
      regionCounts[reg] = (regionCounts[reg] || 0) + 1;
    }
    const regionBreakdown: Record<string, { count: number; percent: number }> = {};
    for (const [reg, count] of Object.entries(regionCounts)) {
      regionBreakdown[reg] = {
        count,
        percent: Math.round((count / totalTendersCount) * 100)
      };
    }

    // Procurement Method Breakdown
    const methodCounts: Record<string, number> = {};
    for (const t of tenders) {
      const method = t.procurementMethod || 'OPEN_TENDER';
      methodCounts[method] = (methodCounts[method] || 0) + 1;
    }
    const procurementMethodBreakdown: Record<string, { count: number; percent: number }> = {};
    for (const [method, count] of Object.entries(methodCounts)) {
      procurementMethodBreakdown[method] = {
        count,
        percent: Math.round((count / totalTendersCount) * 100)
      };
    }

    // Average Days Between Tenders Calculation
    let avgDaysBetweenTenders: number | null = null;
    if (tenders.length >= 2) {
      const dates = tenders.map((t) => new Date(t.publishDate).getTime()).sort((a, b) => a - b);
      let totalDiffDays = 0;
      for (let i = 1; i < dates.length; i++) {
        const diffDays = (dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24);
        totalDiffDays += diffDays;
      }
      avgDaysBetweenTenders = Math.round((totalDiffDays / (dates.length - 1)) * 10) / 10;
    }

    return {
      customerBin: cleanBin,
      customerName,
      totalTendersCount,
      totalAmountSum,
      avgAmount,
      medianAmount,
      categoryBreakdown,
      industryTagsBreakdown,
      regionBreakdown,
      procurementMethodBreakdown,
      avgDaysBetweenTenders
    };
  }

  /**
   * Section 2.2: Fetches customer reputation check result via ReputationService
   */
  static async getCustomerReputation(customerBin: string): Promise<ReputationCheckResult> {
    return await ReputationService.checkBin(customerBin, 'CUSTOMER');
  }

  /**
   * Section 2.3: Lazy-loads winner history for a customer with 24h cache
   */
  static async getOrFetchCustomerWinners(
    customerBin: string,
    maxTenders: number = 10
  ): Promise<CustomerWinnersResult> {
    const cleanBin = (customerBin || '').trim();

    if (!ReputationService.isValidBin(cleanBin)) {
      throw new Error('Некорректный формат БИН/ИИН. Ожидается ровно 12 цифр.');
    }

    const now = new Date();
    const cacheTtlMs = 24 * 60 * 60 * 1000;
    const cacheCutoff = new Date(now.getTime() - cacheTtlMs);

    // 1. Check DB Cache
    try {
      const dbCached = await (prisma as any).customerWinnerCache.findMany({
        where: {
          customerBin: cleanBin,
          checkedAt: {
            gte: cacheCutoff
          }
        },
        orderBy: {
          tenderCount: 'desc'
        }
      });

      if (dbCached && dbCached.length > 0) {
        const sampleSize = dbCached[0].sampleSize || 0;
        return {
          customerBin: cleanBin,
          winners: dbCached.map((rec: any) => ({
            winnerBin: rec.winnerBin,
            winnerName: rec.winnerName,
            tenderCount: rec.tenderCount,
            sampleSize: rec.sampleSize,
            checkedAt: new Date(rec.checkedAt).toISOString()
          })),
          sampleSize,
          cached: true
        };
      }
    } catch {
      // Check memory cache fallback
      const memCached = memoryWinnerCache.get(cleanBin);
      if (memCached && memCached.expiresAt > now) {
        return {
          customerBin: cleanBin,
          winners: memCached.data,
          sampleSize: memCached.data[0]?.sampleSize || 0,
          cached: true
        };
      }
    }

    // 2. Cache miss: Fetch recent tenders for this customer
    let tenders: any[] = [];
    try {
      tenders = await (prisma as any).tender.findMany({
        where: {
          customerBin: cleanBin
        },
        orderBy: {
          publishDate: 'desc'
        },
        take: maxTenders
      });
    } catch (err: any) {
      console.warn(`[CustomerAnalyticsService] DB query for tenders failed:`, err?.message);
    }

    if (tenders.length === 0) {
      return {
        customerBin: cleanBin,
        winners: [],
        sampleSize: 0,
        cached: false
      };
    }

    // 3. Fetch winner results from Goszakup API for these tenders
    const adapter = new GoszakupApiAdapter();
    const winnerMap = new Map<string, { winnerBin: string; winnerName: string | null; count: number }>();
    let processedCount = 0;

    for (const tender of tenders) {
      if (!tender.externalId) continue;
      try {
        const buyResult = await analyticsWinnerRateLimiter.executeWithBackoff(async () => {
          return await adapter.fetchBuyResult(tender.externalId);
        });

        processedCount++;
        if (buyResult && buyResult.isFinished && buyResult.winnerBin) {
          const wBin = buyResult.winnerBin;
          const existing = winnerMap.get(wBin);
          if (existing) {
            existing.count += 1;
          } else {
            winnerMap.set(wBin, {
              winnerBin: wBin,
              winnerName: `Поставщик ${wBin}`,
              count: 1
            });
          }
        }
      } catch (fetchErr: any) {
        console.warn(`[CustomerAnalyticsService] Error fetching buy result for tender ${tender.externalId}:`, fetchErr?.message);
      }
    }

    const winnersList: CustomerWinnerEntry[] = Array.from(winnerMap.values())
      .sort((a, b) => b.count - a.count)
      .map((w) => ({
        winnerBin: w.winnerBin,
        winnerName: w.winnerName,
        tenderCount: w.count,
        sampleSize: processedCount,
        checkedAt: now.toISOString()
      }));

    // 4. Update DB Cache
    try {
      // Clear old cache entries for this customerBin
      await (prisma as any).customerWinnerCache.deleteMany({
        where: {
          customerBin: cleanBin
        }
      });

      // Save new cache entries
      if (winnersList.length > 0) {
        await (prisma as any).customerWinnerCache.createMany({
          data: winnersList.map((w) => ({
            customerBin: cleanBin,
            winnerBin: w.winnerBin,
            winnerName: w.winnerName,
            tenderCount: w.tenderCount,
            sampleSize: w.sampleSize,
            checkedAt: now
          }))
        });
      }
    } catch {
      // Memory fallback
      memoryWinnerCache.set(cleanBin, {
        expiresAt: new Date(now.getTime() + cacheTtlMs),
        data: winnersList
      });
    }

    return {
      customerBin: cleanBin,
      winners: winnersList,
      sampleSize: processedCount,
      cached: false
    };
  }
}
