import { PrismaClient, Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { DEFAULT_PENALTY_RATE_PER_DAY } from '../constants/tender-risk';
import { TelegramBotService } from './telegram.service';

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
      minAcceptableMarginPct: calc.minAcceptableMarginPct != null ? roundMoney(calc.minAcceptableMarginPct) : null,
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

  /**
   * Recalculates all calculations for a tender upon a price change event (Phase 2).
   * If the effective margin drops below the user's minimum acceptable margin threshold,
   * dispatches a Telegram alert.
   */
  static async recalculateOnPriceChange(
    tenderId: string,
    newPrice: number,
    options?: { previousPrice?: number; prismaClient?: PrismaClient | Prisma.TransactionClient }
  ): Promise<{
    recalculatedCount: number;
    redZoneCount: number;
    alertsSent: number;
    results: any[];
  }> {
    const client = options?.prismaClient || prisma;
    let calculations: any[] = [];

    try {
      calculations = await (client as any).tenderCalculation.findMany({
        where: { tenderId },
        include: {
          costItems: true,
          company: true,
          tender: true
        }
      });
    } catch (err: any) {
      console.warn(`[TenderCalculationService] Failed to find calculations for tender ${tenderId}:`, err?.message);
      return { recalculatedCount: 0, redZoneCount: 0, alertsSent: 0, results: [] };
    }

    if (!calculations || calculations.length === 0) {
      return { recalculatedCount: 0, redZoneCount: 0, alertsSent: 0, results: [] };
    }

    let recalculatedCount = 0;
    let redZoneCount = 0;
    let alertsSent = 0;
    const results: any[] = [];

    for (const calc of calculations) {
      try {
        // 1. Update startPrice on the calculation
        await (client as any).tenderCalculation.update({
          where: { id: calc.id },
          data: {
            startPrice: new Prisma.Decimal(newPrice)
          }
        });

        // 2. Recalculate derived totals (totalCost, recommendedPrice, minAcceptablePrice, etc.)
        const updatedCalc = await this.recalculate(calc.id, client);
        recalculatedCount++;

        // 3. Determine minimum threshold (from calc.minAcceptableMarginPct, calc.minMarginPct, or company default)
        const threshold = roundMoney(
          calc.minAcceptableMarginPct != null
            ? calc.minAcceptableMarginPct
            : calc.minMarginPct != null
            ? calc.minMarginPct
            : calc.company?.minAcceptableMarginPct != null
            ? calc.company.minAcceptableMarginPct
            : 5.0
        );

        const totalCost = roundMoney(updatedCalc.totalCost);
        const minAcceptablePrice = roundMoney(updatedCalc.minAcceptablePrice);
        const recommendedPrice = roundMoney(updatedCalc.recommendedPrice);

        // Effective margin % at the new price:
        const effectiveMarginPct = totalCost > 0
          ? roundMoney(((newPrice - totalCost) / totalCost) * 100)
          : 0;

        const isRedZone = newPrice < minAcceptablePrice || effectiveMarginPct < threshold;

        if (isRedZone) {
          redZoneCount++;

          // Dispatch Telegram notification
          const tender = updatedCalc.tender || calc.tender;
          const targetChatId = calc.company?.telegramChatId || process.env.TELEGRAM_DEFAULT_CHAT_ID;

          if (tender && targetChatId) {
            const prevPriceStr = options?.previousPrice 
              ? `${Number(options.previousPrice).toLocaleString('ru-RU')} ₸`
              : 'Не указана';
            const newPriceStr = `${Number(newPrice).toLocaleString('ru-RU')} ₸`;
            const costStr = `${Number(totalCost).toLocaleString('ru-RU')} ₸`;
            const minPriceStr = `${Number(minAcceptablePrice).toLocaleString('ru-RU')} ₸`;

            const alertMessage = 
              `⚠️ <b>Рентабельность лота ушла в красную зону!</b>\n\n` +
              `<b>${tender.title}</b>\n` +
              `📌 Изменение цены: <s>${prevPriceStr}</s> ➔ <b>${newPriceStr}</b>\n` +
              `📉 Текущая маржа при новой цене: <b>${effectiveMarginPct}%</b> (порог: <b>${threshold}%</b>)\n` +
              `💼 Себестоимость: <b>${costStr}</b>\n` +
              `🛑 Мин. допустимая цена: <b>${minPriceStr}</b>\n` +
              `💡 Рекомендуемая цена: <b>${Number(recommendedPrice).toLocaleString('ru-RU')} ₸</b>\n\n` +
              `Участие по текущей цене приведёт к марже ниже установленного минимума!`;

            try {
              const delivery = await TelegramBotService.sendNotification(tender as any, targetChatId, alertMessage);
              if (delivery.success) {
                alertsSent++;
              }
            } catch (notifyErr: any) {
              console.warn(`[TenderCalculationService] Telegram notification failed:`, notifyErr?.message);
            }
          }
        }

        results.push({
          calculationId: calc.id,
          effectiveMarginPct,
          threshold,
          isRedZone,
          totalCost,
          minAcceptablePrice,
          recommendedPrice
        });
      } catch (err: any) {
        console.warn(`[TenderCalculationService] Error recalculating calculation ${calc.id}:`, err?.message);
      }
    }

    return {
      recalculatedCount,
      redZoneCount,
      alertsSent,
      results
    };
  }
}
