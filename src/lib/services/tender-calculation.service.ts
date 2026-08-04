import { PrismaClient, Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { DEFAULT_PENALTY_RATE_PER_DAY } from '../constants/tender-risk';

export function roundMoney(value: number | Prisma.Decimal | string): number {
  const num = typeof value === 'number' ? value : parseFloat(value.toString());
  if (isNaN(num)) return 0;
  return Math.round(num * 100) / 100;
}

export class TenderCalculationService {
  /**
   * Recalculates all derived fields for a TenderCalculation atomically.
   */
  static async recalculate(
    calculationId: string,
    prismaClient: PrismaClient | Prisma.TransactionClient = prisma
  ) {
    const calculation = await prismaClient.tenderCalculation.findUnique({
      where: { id: calculationId },
      include: {
        costItems: true,
        tender: true
      }
    });

    if (!calculation) {
      throw new Error(`TenderCalculation with id ${calculationId} not found`);
    }

    const startPrice = roundMoney(calculation.startPrice);
    const targetMarginPct = roundMoney(calculation.targetMarginPct);
    const minMarginPct = roundMoney(calculation.minMarginPct);

    // 1. Compute each cost item's computedAmount
    let totalCost = 0;
    const costItemUpdates: Array<{ id: string; computedAmount: number }> = [];

    for (const item of calculation.costItems) {
      let computedAmount = 0;
      const amount = roundMoney(item.amount);

      if (item.valueType === 'PERCENTAGE') {
        const baseAmount = item.baseAmount != null ? roundMoney(item.baseAmount) : startPrice;
        computedAmount = roundMoney(baseAmount * (amount / 100));
      } else {
        computedAmount = amount;
      }

      costItemUpdates.push({ id: item.id, computedAmount });
      totalCost = roundMoney(totalCost + computedAmount);
    }

    // 2. Compute minimum acceptable price and recommended price
    const minAcceptablePrice = roundMoney(totalCost * (1 + minMarginPct / 100));
    const recommendedPrice = roundMoney(totalCost * (1 + targetMarginPct / 100));

    // 3. Compute bidding room
    const biddingRoomAmount = roundMoney(startPrice - minAcceptablePrice);
    const biddingRoomPct = startPrice > 0 ? roundMoney((biddingRoomAmount / startPrice) * 100) : 0;

    // 4. Compute risk-adjusted margin
    let riskAdjustedMarginPct: number | null = null;
    const tender = calculation.tender;

    if (tender && (tender.riskScoringStatus === 'AI_SCORED' || (tender as any).riskScoringStatus === 'AI_SCORED')) {
      const riskScore = tender.riskScore;
      const penaltyProbability = Math.min(1.0, Math.max(0.0, riskScore / 100));
      const penaltyRatePerDay = DEFAULT_PENALTY_RATE_PER_DAY;
      const expectedDelayDays = Math.max(5, Math.round(riskScore / 5)); // 5 to 20 days
      const nonDeliveryProbability = Math.min(1.0, Math.max(0.0, (riskScore / 100) * 0.25));

      const perfBondItem = calculation.costItems.find(i => i.category === 'PERFORMANCE_BOND');
      const performanceBondAmount = perfBondItem
        ? roundMoney(perfBondItem.amount)
        : roundMoney((tender.amount || startPrice) * 0.03);

      const expectedPenaltyLoss = penaltyProbability * penaltyRatePerDay * expectedDelayDays * recommendedPrice;
      const expectedNonDeliveryLoss = nonDeliveryProbability * performanceBondAmount;
      const totalExpectedLoss = expectedPenaltyLoss + expectedNonDeliveryLoss;

      const lossMarginPenalty = totalCost > 0 ? (totalExpectedLoss / totalCost) * 100 : 0;
      riskAdjustedMarginPct = roundMoney(targetMarginPct - lossMarginPenalty);
    }

    // 5. Execute atomic updates
    const runInTx = async (tx: Prisma.TransactionClient) => {
      for (const update of costItemUpdates) {
        await tx.tenderCostItem.update({
          where: { id: update.id },
          data: { computedAmount: new Prisma.Decimal(update.computedAmount) }
        });
      }

      return await tx.tenderCalculation.update({
        where: { id: calculationId },
        data: {
          totalCost: new Prisma.Decimal(totalCost),
          minAcceptablePrice: new Prisma.Decimal(minAcceptablePrice),
          recommendedPrice: new Prisma.Decimal(recommendedPrice),
          biddingRoomAmount: new Prisma.Decimal(biddingRoomAmount),
          biddingRoomPct: new Prisma.Decimal(biddingRoomPct),
          riskAdjustedMarginPct: riskAdjustedMarginPct != null ? new Prisma.Decimal(riskAdjustedMarginPct) : null
        },
        include: {
          costItems: true,
          tender: true,
          company: true
        }
      });
    };

    if ('$transaction' in prismaClient && typeof prismaClient.$transaction === 'function') {
      return await (prismaClient as PrismaClient).$transaction(async tx => runInTx(tx));
    } else {
      return await runInTx(prismaClient as Prisma.TransactionClient);
    }
  }

  /**
   * Helper to serialize Decimal fields to numbers for JSON API responses
   */
  static formatCalculationResponse(calc: any) {
    if (!calc) return null;
    return {
      id: calc.id,
      tenderId: calc.tenderId,
      companyId: calc.companyId,
      startPrice: roundMoney(calc.startPrice),
      totalCost: roundMoney(calc.totalCost),
      targetMarginPct: roundMoney(calc.targetMarginPct),
      minMarginPct: roundMoney(calc.minMarginPct),
      riskAdjustedMarginPct: calc.riskAdjustedMarginPct != null ? roundMoney(calc.riskAdjustedMarginPct) : null,
      recommendedPrice: roundMoney(calc.recommendedPrice),
      minAcceptablePrice: roundMoney(calc.minAcceptablePrice),
      biddingRoomPct: calc.biddingRoomPct != null ? roundMoney(calc.biddingRoomPct) : null,
      biddingRoomAmount: calc.biddingRoomAmount != null ? roundMoney(calc.biddingRoomAmount) : null,
      costItems: (calc.costItems || []).map((item: any) => ({
        id: item.id,
        calculationId: item.calculationId,
        category: item.category,
        label: item.label,
        valueType: item.valueType,
        amount: roundMoney(item.amount),
        baseAmount: item.baseAmount != null ? roundMoney(item.baseAmount) : null,
        computedAmount: roundMoney(item.computedAmount),
        createdAt: item.createdAt,
        updatedAt: item.updatedAt
      })),
      createdAt: calc.createdAt,
      updatedAt: calc.updatedAt
    };
  }
}
