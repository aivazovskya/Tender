import { prisma } from '../prisma';

export interface PriceBenchmarkResult {
  category: string;
  region?: string | null;
  sampleSize: number;
  avgAmount: number;
  medianAmount: number;
  minAmount: number;
  maxAmount: number;
  periodMonths: number;
  isReliable: boolean; // sampleSize >= 5
}

interface CacheEntry {
  timestamp: number;
  data: PriceBenchmarkResult;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export class PriceBenchmarkService {
  static async getBenchmarkForCategory(
    category: string,
    region?: string | null,
    periodMonths: number = 6
  ): Promise<PriceBenchmarkResult> {
    const cacheKey = `${category}_${region || 'ALL'}_${periodMonths}`;
    const cached = cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }

    const since = new Date();
    since.setMonth(since.getMonth() - periodMonths);

    const whereClause: any = {
      category,
      publishDate: { gte: since },
      status: 'CLOSED'
    };

    if (region && region !== 'Все регионы') {
      whereClause.region = region;
    }

    let closedTenders: any[] = [];
    try {
      closedTenders = await prisma.tender.findMany({
        where: whereClause,
        select: { amount: true }
      });

      // Fallback: If region filter yields 0 results, retry without region filter for category
      if (closedTenders.length === 0 && region) {
        delete whereClause.region;
        closedTenders = await prisma.tender.findMany({
          where: whereClause,
          select: { amount: true }
        });
      }
    } catch {
      closedTenders = [];
    }

    const amounts = closedTenders.map(t => Number(t.amount)).filter(a => a > 0).sort((a, b) => a - b);
    const sampleSize = amounts.length;

    if (sampleSize === 0) {
      const emptyResult: PriceBenchmarkResult = {
        category,
        region,
        sampleSize: 0,
        avgAmount: 0,
        medianAmount: 0,
        minAmount: 0,
        maxAmount: 0,
        periodMonths,
        isReliable: false
      };
      cache.set(cacheKey, { timestamp: Date.now(), data: emptyResult });
      return emptyResult;
    }

    const sum = amounts.reduce((acc, val) => acc + val, 0);
    const avgAmount = Math.round(sum / sampleSize);

    let medianAmount = 0;
    const mid = Math.floor(sampleSize / 2);
    if (sampleSize % 2 === 0) {
      medianAmount = Math.round((amounts[mid - 1] + amounts[mid]) / 2);
    } else {
      medianAmount = Math.round(amounts[mid]);
    }

    const minAmount = amounts[0];
    const maxAmount = amounts[sampleSize - 1];

    const result: PriceBenchmarkResult = {
      category,
      region,
      sampleSize,
      avgAmount,
      medianAmount,
      minAmount,
      maxAmount,
      periodMonths,
      isReliable: sampleSize >= 5
    };

    cache.set(cacheKey, { timestamp: Date.now(), data: result });
    return result;
  }
}
