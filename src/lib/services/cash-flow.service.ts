import { prisma } from '../prisma';

export interface CashFlowSummaryResult {
  companyProfileId: string;
  currency: string;
  totalFrozenCash: number;
  totalUnfrozenGuarantees: number;
  activeInstrumentsCount: number;
  breakdown: {
    bidSecurityDepositAmount: number;
    bidSecurityDepositCount: number;
    performanceBondDepositAmount: number;
    performanceBondDepositCount: number;
    bidSecurityGuaranteeAmount: number;
    bidSecurityGuaranteeCount: number;
    performanceBondGuaranteeAmount: number;
    performanceBondGuaranteeCount: number;
  };
}

export interface CashFlowTimelineEntry {
  id: string;
  tenderId: string;
  tenderTitle: string;
  customerName: string;
  type: 'BID_SECURITY_DEPOSIT' | 'PERFORMANCE_BOND_DEPOSIT';
  amount: number;
  expiryDate: string;
  daysRemaining: number;
}

export interface CashFlowTimelineResult {
  companyProfileId: string;
  currency: string;
  totalFrozenCash: number;
  disclaimer: string;
  horizons: {
    thisWeekAmount: number;
    thisWeekCount: number;
    next30DaysAmount: number;
    next30DaysCount: number;
    after30DaysAmount: number;
    after30DaysCount: number;
  };
  timeline: CashFlowTimelineEntry[];
}

// In-memory store fallback for offline test environments
const memoryInstruments = new Map<string, any>();

function isMemoryMode(): boolean {
  return process.env.AUTH_STORE_MODE === 'memory';
}

export class CashFlowService {
  /**
   * Section 2: Computes cash flow summary of active frozen deposits vs non-cash guarantees
   */
  static async getCashFlowSummary(companyProfileId: string): Promise<CashFlowSummaryResult> {
    if (!companyProfileId) {
      throw new Error('companyProfileId обязателен для формирования сводки кассового разрыва');
    }

    let instruments: any[] = [];
    if (isMemoryMode()) {
      instruments = Array.from(memoryInstruments.values()).filter(
        i => i.companyProfileId === companyProfileId && i.status === 'ACTIVE'
      );
    } else {
      try {
        instruments = await (prisma as any).securityInstrument.findMany({
          where: {
            companyProfileId,
            status: 'ACTIVE'
          }
        });
      } catch (err: any) {
        console.warn('[CashFlowService] DB query fallback for getCashFlowSummary:', err?.message);
        instruments = Array.from(memoryInstruments.values()).filter(
          i => i.companyProfileId === companyProfileId && i.status === 'ACTIVE'
        );
      }
    }

    let bidSecurityDepositAmount = 0;
    let bidSecurityDepositCount = 0;
    let performanceBondDepositAmount = 0;
    let performanceBondDepositCount = 0;
    let bidSecurityGuaranteeAmount = 0;
    let bidSecurityGuaranteeCount = 0;
    let performanceBondGuaranteeAmount = 0;
    let performanceBondGuaranteeCount = 0;

    for (const inst of instruments) {
      const amt = Number(inst.amount || 0);
      switch (inst.type) {
        case 'BID_SECURITY_DEPOSIT':
          bidSecurityDepositAmount += amt;
          bidSecurityDepositCount += 1;
          break;
        case 'PERFORMANCE_BOND_DEPOSIT':
          performanceBondDepositAmount += amt;
          performanceBondDepositCount += 1;
          break;
        case 'BID_SECURITY_BANK_GUARANTEE':
          bidSecurityGuaranteeAmount += amt;
          bidSecurityGuaranteeCount += 1;
          break;
        case 'PERFORMANCE_BOND_BANK_GUARANTEE':
          performanceBondGuaranteeAmount += amt;
          performanceBondGuaranteeCount += 1;
          break;
      }
    }

    const totalFrozenCash = bidSecurityDepositAmount + performanceBondDepositAmount;
    const totalUnfrozenGuarantees = bidSecurityGuaranteeAmount + performanceBondGuaranteeAmount;

    return {
      companyProfileId,
      currency: 'KZT',
      totalFrozenCash,
      totalUnfrozenGuarantees,
      activeInstrumentsCount: instruments.length,
      breakdown: {
        bidSecurityDepositAmount,
        bidSecurityDepositCount,
        performanceBondDepositAmount,
        performanceBondDepositCount,
        bidSecurityGuaranteeAmount,
        bidSecurityGuaranteeCount,
        performanceBondGuaranteeAmount,
        performanceBondGuaranteeCount
      }
    };
  }

  /**
   * Section 3: Computes deposit release forecast timeline ordered by expiryDate ASC
   */
  static async getCashFlowTimeline(companyProfileId: string): Promise<CashFlowTimelineResult> {
    if (!companyProfileId) {
      throw new Error('companyProfileId обязателен для формирования таймлайна освобождения средств');
    }

    let depositInstruments: any[] = [];
    if (isMemoryMode()) {
      depositInstruments = Array.from(memoryInstruments.values()).filter(
        i => i.companyProfileId === companyProfileId &&
             i.status === 'ACTIVE' &&
             ['BID_SECURITY_DEPOSIT', 'PERFORMANCE_BOND_DEPOSIT'].includes(i.type)
      ).sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime());
    } else {
      try {
        depositInstruments = await (prisma as any).securityInstrument.findMany({
          where: {
            companyProfileId,
            status: 'ACTIVE',
            type: {
              in: ['BID_SECURITY_DEPOSIT', 'PERFORMANCE_BOND_DEPOSIT']
            }
          },
          include: {
            tender: {
              select: {
                id: true,
                title: true,
                customerName: true
              }
            }
          },
          orderBy: {
            expiryDate: 'asc'
          }
        });
      } catch (err: any) {
        console.warn('[CashFlowService] DB query fallback for getCashFlowTimeline:', err?.message);
        depositInstruments = Array.from(memoryInstruments.values()).filter(
          i => i.companyProfileId === companyProfileId &&
               i.status === 'ACTIVE' &&
               ['BID_SECURITY_DEPOSIT', 'PERFORMANCE_BOND_DEPOSIT'].includes(i.type)
        ).sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime());
      }
    }

    const now = Date.now();
    let totalFrozenCash = 0;
    let thisWeekAmount = 0;
    let thisWeekCount = 0;
    let next30DaysAmount = 0;
    let next30DaysCount = 0;
    let after30DaysAmount = 0;
    let after30DaysCount = 0;

    const timeline: CashFlowTimelineEntry[] = [];

    for (const inst of depositInstruments) {
      const amt = Number(inst.amount || 0);
      totalFrozenCash += amt;

      const expiryMs = new Date(inst.expiryDate).getTime();
      const diffMs = expiryMs - now;
      const daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

      if (daysRemaining <= 7) {
        thisWeekAmount += amt;
        thisWeekCount += 1;
      } else if (daysRemaining <= 30) {
        next30DaysAmount += amt;
        next30DaysCount += 1;
      } else {
        after30DaysAmount += amt;
        after30DaysCount += 1;
      }

      timeline.push({
        id: inst.id,
        tenderId: inst.tenderId || inst.tender?.id || '',
        tenderTitle: inst.tender?.title || inst.tenderTitle || 'Закупка',
        customerName: inst.tender?.customerName || inst.customerName || 'Заказчик',
        type: inst.type,
        amount: amt,
        expiryDate: new Date(inst.expiryDate).toISOString(),
        daysRemaining
      });
    }

    return {
      companyProfileId,
      currency: 'KZT',
      totalFrozenCash,
      disclaimer: 'expiryDate является плановой датой истечения обеспечения. Фактический возврат средств заказчиком/банком может потребовать дополнительного времени после наступления плановой даты.',
      horizons: {
        thisWeekAmount,
        thisWeekCount,
        next30DaysAmount,
        next30DaysCount,
        after30DaysAmount,
        after30DaysCount
      },
      timeline
    };
  }

  /**
   * Helper for test seeding in memory mode
   */
  static seedMemoryInstrument(instrument: any) {
    memoryInstruments.set(instrument.id, instrument);
  }

  /**
   * Helper for test resetting
   */
  static clearMemoryStore() {
    memoryInstruments.clear();
  }
}
