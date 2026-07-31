import { prisma } from '../prisma';
import { 
  Tender, 
  CompanyProfileData, 
  CompetitionEstimate, 
  CompetitionLevel, 
  EstimateConfidence 
} from '../types/tender';

// In-memory fallback for stats in offline/demo mode without active DB
const memoryParticipationStats = new Map<string, {
  winRateProxy: number;
  sampleSize: number;
  wonCount: number;
  lostCount: number;
}>();

/**
 * Service for calculating competition level and personal win probability for a tender.
 * Phase 1: Statistical Heuristic & Anonymous Kanban/Tender aggregation engine.
 * 
 * Note regarding Defect #1 fix:
 * Participant count ('estimatedParticipants') is calculated strictly via financial lot amount heuristics.
 * Because Goszakup GraphQL API does not expose lot participant count protocol data, 'confidence' for participant
 * count estimation is ALWAYS 'LOW' (never 'HIGH' or 'MEDIUM').
 */
export class CompetitionService {
  /**
   * Main estimation function with strict confidence ratings and sample size checks.
   */
  static async estimate(
    tender: Tender,
    companyProfile?: CompanyProfileData,
    userId?: string
  ): Promise<CompetitionEstimate> {
    const isSingleSource = tender.procurementMethod === 'SINGLE_SOURCE';
    const category = tender.category || 'Общие закупки';
    const region = tender.region || 'Все регионы';
    const procurementMethod = tender.procurementMethod || 'OPEN_TENDER';

    // 1. Single Source Procurement handling (Criteria #1)
    if (isSingleSource) {
      let userCategoryDeals = 0;
      if (userId || companyProfile?.bin) {
        userCategoryDeals = await this.getUserCategoryDealsCount(userId, companyProfile?.bin, category);
      }

      return {
        tenderId: tender.id,
        competitionLevel: 'LOW',
        estimatedParticipants: 1,
        procurementMethod: tender.procurementMethod,
        isSingleSource: true,
        confidence: 'HIGH',
        sampleSize: 0,
        basis: 'Способ закупки — из одного источника, конкурентных торгов не предполагается',
        winProbability: null,
        winProbabilityReason: 'single_source',
        userHistoryCount: userCategoryDeals,
        hideDetailedCounts: true
      };
    }

    // 2. Lookup TenderParticipationStat (Criteria #2)
    const statKey = `${category}_${region}_${procurementMethod}`;
    let statRecord: any = null;

    try {
      statRecord = await (prisma as any).tenderParticipationStat.findUnique({
        where: {
          category_region_procurementMethod: {
            category,
            region,
            procurementMethod: procurementMethod as any
          }
        }
      });
    } catch {
      statRecord = memoryParticipationStats.get(statKey) || null;
    }

    let sampleSize = statRecord ? statRecord.sampleSize : 0;
    let hideDetailedCounts = sampleSize < 3; // Criteria #5: Privacy guard when sampleSize < 3

    // Calculate estimatedParticipants exclusively via lot amount financial heuristic (Defect #1 Fix)
    const amount = tender.amount || 0;
    let estimatedParticipants: number;
    let competitionLevel: CompetitionLevel;

    if (amount >= 100_000_000) {
      estimatedParticipants = 7;
      competitionLevel = 'HIGH';
    } else if (amount >= 10_000_000) {
      estimatedParticipants = 4;
      competitionLevel = 'MEDIUM';
    } else {
      estimatedParticipants = 2;
      competitionLevel = 'LOW';
    }

    // CRITICAL: Participant count confidence is ALWAYS 'LOW' because we do NOT have actual lot participant count protocol data!
    const confidence: EstimateConfidence = 'LOW';
    let basis: string;

    if (statRecord && statRecord.sampleSize >= 5) {
      basis = `Финансовая эвристика по сумме лота (на основе ${statRecord.sampleSize} прошлых сделок по категории «${category}» в ${region}, без протокола участников)`;
    } else {
      basis = `Базовый финансовый расчёт по сумме лота (недостаточно локальной статистики: ${sampleSize} сделок, без протокола участников)`;
    }

    // 3. Calculate Personal Win Probability (Criteria #3)
    let winProbability: number | null = null;
    let winProbabilityReason: string | null = 'insufficient_history';
    let userCategoryDeals = 0;

    if (userId || companyProfile?.bin) {
      const userDeals = await this.getUserCategoryDeals(userId, companyProfile?.bin, category);
      userCategoryDeals = userDeals.total;

      // Hard threshold: winProbability calculated ONLY if user has >= 5 completed deals in category
      if (userDeals.total >= 5) {
        const rawWinPct = Math.round((userDeals.won / userDeals.total) * 100);
        winProbability = Math.min(95, Math.max(5, rawWinPct));
        winProbabilityReason = 'calculated';
      } else {
        winProbability = null;
        winProbabilityReason = 'insufficient_history';
      }
    }

    return {
      tenderId: tender.id,
      competitionLevel,
      estimatedParticipants,
      procurementMethod: tender.procurementMethod,
      isSingleSource: false,
      confidence,
      sampleSize,
      basis,
      winProbability,
      winProbabilityReason,
      userHistoryCount: userCategoryDeals,
      hideDetailedCounts
    };
  }

  /**
   * Helper to count completed deals for user/profile in category
   */
  private static async getUserCategoryDeals(
    userId?: string,
    bin?: string,
    category?: string
  ): Promise<{ total: number; won: number; lost: number }> {
    if (!userId && !bin) return { total: 0, won: 0, lost: 0 };

    try {
      const cards = await prisma.kanbanCard.findMany({
        where: {
          ...(userId ? { userId } : {}),
          stage: { in: ['WON', 'LOST'] as any },
          tender: { category: category || undefined }
        },
        select: { stage: true }
      });

      const total = cards.length;
      const won = cards.filter(c => c.stage === 'WON').length;
      const lost = total - won;

      return { total, won, lost };
    } catch {
      return { total: 0, won: 0, lost: 0 };
    }
  }

  private static async getUserCategoryDealsCount(userId?: string, bin?: string, category?: string): Promise<number> {
    const deals = await this.getUserCategoryDeals(userId, bin, category);
    return deals.total;
  }

  /**
   * Background job method to anonymously aggregate KanbanCard statistics into TenderParticipationStat.
   * Note: avgParticipants represents winRateProxy (total/won ratio), NOT actual participant count from procurement protocol.
   */
  static async recomputeStats(): Promise<{ processedCount: number; updatedStatsCount: number }> {
    try {
      const completedCards = await prisma.kanbanCard.findMany({
        where: {
          stage: { in: ['WON', 'LOST'] as any }
        },
        include: { tender: true }
      });

      if (!completedCards || completedCards.length === 0) {
        return { processedCount: 0, updatedStatsCount: 0 };
      }

      const groups = new Map<string, {
        category: string;
        region: string;
        procurementMethod: string;
        won: number;
        lost: number;
        total: number;
      }>();

      for (const card of completedCards) {
        if (!card.tender) continue;
        const cat = card.tender.category || 'Общие закупки';
        const reg = card.tender.region || 'Все регионы';
        const pm = card.tender.procurementMethod || 'OPEN_TENDER';
        const key = `${cat}_${reg}_${pm}`;

        let g = groups.get(key);
        if (!g) {
          g = { category: cat, region: reg, procurementMethod: pm, won: 0, lost: 0, total: 0 };
          groups.set(key, g);
        }

        g.total += 1;
        if (card.stage === 'WON') g.won += 1;
        else g.lost += 1;
      }

      let updatedCount = 0;
      for (const g of groups.values()) {
        // winRateProxy ratio (total / won), NOT actual participant count from protocol
        const winRateProxy = Math.max(2.0, Math.round((g.total / Math.max(1, g.won)) * 10) / 10);

        try {
          await (prisma as any).tenderParticipationStat.upsert({
            where: {
              category_region_procurementMethod: {
                category: g.category,
                region: g.region,
                procurementMethod: g.procurementMethod as any
              }
            },
            update: {
              avgParticipants: winRateProxy,
              sampleSize: g.total,
              wonCount: g.won,
              lostCount: g.lost
            },
            create: {
              category: g.category,
              region: g.region,
              procurementMethod: g.procurementMethod as any,
              avgParticipants: winRateProxy,
              sampleSize: g.total,
              wonCount: g.won,
              lostCount: g.lost
            }
          });
          updatedCount++;
        } catch {
          memoryParticipationStats.set(`${g.category}_${g.region}_${g.procurementMethod}`, {
            winRateProxy,
            sampleSize: g.total,
            wonCount: g.won,
            lostCount: g.lost
          });
          updatedCount++;
        }
      }

      return { processedCount: completedCards.length, updatedStatsCount: updatedCount };
    } catch (err) {
      console.warn('[CompetitionService] Ошибка агрегации статистики:', err);
      return { processedCount: 0, updatedStatsCount: 0 };
    }
  }
}
