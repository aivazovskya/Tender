import { prisma } from '../prisma';

export interface CategoryBreakdown {
  category: string;
  submitted: number;
  won: number;
  winRatePct: number;
  totalWonValue: number;
}

export interface ManagementReport {
  periodStart: Date;
  periodEnd: Date;
  totalSubmitted: number;
  totalWon: number;
  winRatePct: number;
  avgDiscountFromStartPricePct: number;
  totalContractValueWon: number;
  byCategory: CategoryBreakdown[];
}

export class ManagementReportService {
  static async generateReport(
    from?: Date | string,
    to?: Date | string,
    userId?: string
  ): Promise<ManagementReport> {
    const periodStart = from ? new Date(from) : new Date(new Date().setMonth(new Date().getMonth() - 6));
    const periodEnd = to ? new Date(to) : new Date();

    const whereClause: any = {
      updatedAt: {
        gte: periodStart,
        lte: periodEnd
      }
    };

    if (userId) {
      whereClause.userId = userId;
    }

    let cards: any[] = [];
    try {
      cards = await prisma.kanbanCard.findMany({
        where: whereClause,
        include: {
          tender: {
            select: {
              id: true,
              title: true,
              category: true,
              amount: true
            }
          }
        }
      });
    } catch (err) {
      cards = [];
    }

    const submittedCards = cards.filter(c => c.stage === 'SUBMITTED' || c.stage === 'WON' || c.stage === 'LOST');
    const wonCards = cards.filter(c => c.stage === 'WON');

    const totalSubmitted = submittedCards.length;
    const totalWon = wonCards.length;
    const winRatePct = totalSubmitted > 0 ? Math.round((totalWon / totalSubmitted) * 1000) / 10 : 0;

    let totalContractValueWon = 0;
    let totalDiscountPctSum = 0;
    let discountSampleCount = 0;

    for (const card of wonCards) {
      const winAmount = card.finalWinAmount != null ? Number(card.finalWinAmount) : Number(card.tender.amount);
      totalContractValueWon += winAmount;

      const startPrice = Number(card.tender.amount);
      if (startPrice > 0 && card.finalWinAmount != null) {
        const discountPct = ((startPrice - winAmount) / startPrice) * 100;
        if (discountPct >= 0) {
          totalDiscountPctSum += discountPct;
          discountSampleCount++;
        }
      }
    }

    const avgDiscountFromStartPricePct = discountSampleCount > 0 
      ? Math.round((totalDiscountPctSum / discountSampleCount) * 10) / 10 
      : 0;

    // Grouping by Category
    const categoryMap = new Map<string, { submitted: number; won: number; totalWonValue: number }>();

    for (const card of submittedCards) {
      const cat = card.tender.category || 'Прочее';
      const existing = categoryMap.get(cat) || { submitted: 0, won: 0, totalWonValue: 0 };
      existing.submitted++;

      if (card.stage === 'WON') {
        existing.won++;
        const winAmount = card.finalWinAmount != null ? Number(card.finalWinAmount) : Number(card.tender.amount);
        existing.totalWonValue += winAmount;
      }

      categoryMap.set(cat, existing);
    }

    const byCategory: CategoryBreakdown[] = Array.from(categoryMap.entries()).map(([category, stats]) => ({
      category,
      submitted: stats.submitted,
      won: stats.won,
      winRatePct: stats.submitted > 0 ? Math.round((stats.won / stats.submitted) * 1000) / 10 : 0,
      totalWonValue: Math.round(stats.totalWonValue)
    })).sort((a, b) => b.totalWonValue - a.totalWonValue);

    return {
      periodStart,
      periodEnd,
      totalSubmitted,
      totalWon,
      winRatePct,
      avgDiscountFromStartPricePct,
      totalContractValueWon: Math.round(totalContractValueWon),
      byCategory
    };
  }
}
