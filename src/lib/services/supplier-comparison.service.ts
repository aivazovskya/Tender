import { prisma } from '../prisma';
import { resolveOwnCompanyProfile } from '../security/resolve-company-profile';
import { 
  TenderSupplierComparisonData, 
  ComparisonSupplierData, 
  ComparisonLineItemData, 
  ComparisonSupplierPriceData,
  ComparisonSupplierSummary 
} from '../types/tender';
import { INITIAL_TENDERS } from '../mockData';

export class SupplierComparisonService {
  /**
   * Computes totals, discounts, revenues, margins and marks best price
   */
  static computeSummaries(data: TenderSupplierComparisonData, defaultTenderAmount: number = 0): {
    totalBudgetKzt0: number;
    totalBudgetKzt12: number;
    summaries: ComparisonSupplierSummary[];
  } {
    const exchangeRate = Number(data.exchangeRate) || 5.20;
    const creditCost = Number(data.creditCost) || 0;

    let totalBudgetKzt0 = 0;
    let totalBudgetKzt12 = 0;

    for (const item of data.lineItems) {
      const qty = Number(item.quantity) || 1;
      const b0 = Number(item.budgetPriceKzt0) || 0;
      const b12 = Number(item.budgetPriceKzt12) || (b0 * 1.12);
      totalBudgetKzt0 += qty * b0;
      totalBudgetKzt12 += qty * b12;
    }

    if (totalBudgetKzt12 === 0 && defaultTenderAmount > 0) {
      totalBudgetKzt12 = defaultTenderAmount;
      totalBudgetKzt0 = Math.round(defaultTenderAmount / 1.12);
    }

    const supplierSums: Record<string, { totalKzt0: number; totalKzt12: number; totalRub0: number }> = {};

    data.suppliers.forEach(s => {
      supplierSums[s.id || s.name] = { totalKzt0: 0, totalKzt12: 0, totalRub0: 0 };
    });

    for (const item of data.lineItems) {
      const qty = Number(item.quantity) || 1;
      for (const supplier of data.suppliers) {
        const suppKey = supplier.id || supplier.name;
        const priceObj = item.prices[suppKey] || item.prices[supplier.id || ''] || item.prices[supplier.name];

        let p0 = 0;
        let p12 = 0;
        let pRub = 0;

        if (priceObj) {
          pRub = Number(priceObj.priceRub0) || 0;
          if (priceObj.currency === 'RUB' && pRub > 0) {
            p0 = pRub * exchangeRate;
            p12 = p0 * 1.12;
          } else {
            p0 = Number(priceObj.priceKzt0) || 0;
            p12 = Number(priceObj.priceKzt12) || (p0 * 1.12);
            if (pRub === 0 && p0 > 0 && exchangeRate > 0) {
              pRub = Math.round((p0 / exchangeRate) * 100) / 100;
            }
          }
        }

        supplierSums[suppKey].totalKzt0 += qty * p0;
        supplierSums[suppKey].totalKzt12 += qty * p12;
        supplierSums[suppKey].totalRub0 += qty * pRub;
      }
    }

    let minTotalKzt12 = Infinity;
    const summaries: ComparisonSupplierSummary[] = [];

    data.suppliers.forEach(s => {
      const suppKey = s.id || s.name;
      const sums = supplierSums[suppKey] || { totalKzt0: 0, totalKzt12: 0, totalRub0: 0 };
      const discountPct = Number(s.discountPercent) || 0;
      const discountMultiplier = 1 - (discountPct / 100);

      const totalWithDiscountKzt0 = sums.totalKzt0 * discountMultiplier;
      const totalWithDiscountKzt12 = sums.totalKzt12 * discountMultiplier;

      if (totalWithDiscountKzt12 > 0 && totalWithDiscountKzt12 < minTotalKzt12) {
        minTotalKzt12 = totalWithDiscountKzt12;
      }

      const revenue = totalBudgetKzt12 > 0 ? totalBudgetKzt12 : (totalWithDiscountKzt12 * 1.15);
      const grossMarginKzt = revenue - totalWithDiscountKzt12;
      const grossMarginPct = revenue > 0 ? Math.round((grossMarginKzt / revenue) * 10000) / 100 : 0;

      const netMarginWithCreditKzt = grossMarginKzt - creditCost;
      const netMarginWithCreditPct = revenue > 0 ? Math.round((netMarginWithCreditKzt / revenue) * 10000) / 100 : 0;

      summaries.push({
        supplierId: suppKey,
        name: s.name,
        totalKzt0: Math.round(sums.totalKzt0 * 100) / 100,
        totalKzt12: Math.round(sums.totalKzt12 * 100) / 100,
        totalRub0: Math.round(sums.totalRub0 * 100) / 100,
        discountPercent: discountPct,
        totalWithDiscountKzt0: Math.round(totalWithDiscountKzt0 * 100) / 100,
        totalWithDiscountKzt12: Math.round(totalWithDiscountKzt12 * 100) / 100,
        revenueKzt: Math.round(revenue * 100) / 100,
        grossMarginKzt: Math.round(grossMarginKzt * 100) / 100,
        grossMarginPct,
        netMarginWithCreditKzt: Math.round(netMarginWithCreditKzt * 100) / 100,
        netMarginWithCreditPct,
        isSelected: !!s.isSelected || data.selectedSupplierId === suppKey,
        isBestPrice: false // populated in second pass
      });
    });

    summaries.forEach(sum => {
      if (sum.totalWithDiscountKzt12 > 0 && sum.totalWithDiscountKzt12 === minTotalKzt12) {
        sum.isBestPrice = true;
      }
    });

    return {
      totalBudgetKzt0: Math.round(totalBudgetKzt0 * 100) / 100,
      totalBudgetKzt12: Math.round(totalBudgetKzt12 * 100) / 100,
      summaries
    };
  }

  /**
   * Fetches or initializes comparison sheet for a tender
   */
  static async getOrCreateComparison(tenderId: string, userId: string): Promise<TenderSupplierComparisonData> {
    let company = await resolveOwnCompanyProfile(userId);
    if (!company) {
      company = { id: 'temp-comp-id', companyName: 'Моя компания', bin: '123456789012' } as any;
    }

    let dbTender: any = null;
    try {
      dbTender = await prisma.tender.findUnique({
        where: { id: tenderId }
      });
    } catch {
      // ignore
    }

    if (!dbTender) {
      dbTender = INITIAL_TENDERS.find(t => t.id === tenderId) || {
        id: tenderId,
        externalId: 'LOT-DEMO',
        title: 'Поставка товаров по спецификации',
        customerName: 'АО «Национальная Компания»',
        customerBin: '990140001234',
        source: 'goszakup.gov.kz',
        amount: 15000000,
        publishDate: new Date(),
        deadlineDate: new Date(Date.now() + 14 * 86400000)
      };
    }

    try {
      const existing = await prisma.tenderSupplierComparison.findFirst({
        where: {
          tenderId,
          ...(company?.id && !company.id.startsWith('temp-') ? { companyId: company.id } : {})
        },
        include: {
          suppliers: { orderBy: { order: 'asc' } },
          lineItems: {
            orderBy: { order: 'asc' },
            include: { prices: true }
          }
        }
      });

      if (existing) {
        const suppliersData: ComparisonSupplierData[] = existing.suppliers.map(s => ({
          id: s.id,
          name: s.name,
          address: s.address || '',
          email: s.email || '',
          phone: s.phone || '',
          paymentTerms: s.paymentTerms || '',
          paymentForm: s.paymentForm || '',
          bidSecurity: s.bidSecurity ? Number(s.bidSecurity) : undefined,
          discountPercent: s.discountPercent ? Number(s.discountPercent) : 0,
          order: s.order,
          isSelected: s.isSelected
        }));

        const lineItemsData: ComparisonLineItemData[] = existing.lineItems.map(item => {
          const pricesMap: Record<string, ComparisonSupplierPriceData> = {};
          item.prices.forEach(p => {
            pricesMap[p.supplierId] = {
              id: p.id,
              lineItemId: p.lineItemId,
              supplierId: p.supplierId,
              proposedName: p.proposedName || '',
              priceKzt0: p.priceKzt0 ? Number(p.priceKzt0) : undefined,
              priceKzt12: p.priceKzt12 ? Number(p.priceKzt12) : undefined,
              priceRub0: p.priceRub0 ? Number(p.priceRub0) : undefined,
              currency: p.currency || 'KZT'
            };
          });

          return {
            id: item.id,
            order: item.order,
            mpzCode: item.mpzCode || '',
            name: item.name,
            unit: item.unit || 'шт',
            quantity: Number(item.quantity) || 1,
            budgetPriceKzt0: item.budgetPriceKzt0 ? Number(item.budgetPriceKzt0) : undefined,
            budgetPriceKzt12: item.budgetPriceKzt12 ? Number(item.budgetPriceKzt12) : undefined,
            prices: pricesMap
          };
        });

        const rawData: TenderSupplierComparisonData = {
          id: existing.id,
          tenderId: existing.tenderId,
          companyId: existing.companyId,
          tenderTitle: dbTender.title,
          tenderNumber: dbTender.externalId,
          tradingPlatform: dbTender.source,
          customerName: dbTender.customerName,
          customerBin: dbTender.customerBin,
          publishDate: dbTender.publishDate ? new Date(dbTender.publishDate).toISOString() : undefined,
          deadlineDate: dbTender.deadlineDate ? new Date(dbTender.deadlineDate).toISOString() : undefined,
          exchangeRate: Number(existing.exchangeRate) || 5.20,
          notes: existing.notes || '',
          selectedSupplierId: existing.selectedSupplierId,
          creditAmount: existing.creditAmount ? Number(existing.creditAmount) : undefined,
          creditDays: existing.creditDays || undefined,
          creditCost: existing.creditCost ? Number(existing.creditCost) : undefined,
          suppliers: suppliersData,
          lineItems: lineItemsData
        };

        const { totalBudgetKzt0, totalBudgetKzt12, summaries } = SupplierComparisonService.computeSummaries(rawData, dbTender.amount);
        return {
          ...rawData,
          totalBudgetKzt0,
          totalBudgetKzt12,
          summaries
        };
      }
    } catch (err: any) {
      console.warn('[SupplierComparisonService] DB lookup error:', err?.message);
    }

    // Default template seeding
    const defaultExchangeRate = 5.20;
    const defaultAmount = Number(dbTender.amount) || 10000000;
    const defaultBudget0 = Math.round((defaultAmount / 1.12) * 100) / 100;
    const defaultBudget12 = defaultAmount;

    const supp1Id = 'supp-1';
    const supp2Id = 'supp-2';
    const supp3Id = 'supp-3';

    const defaultSuppliers: ComparisonSupplierData[] = [
      {
        id: supp1Id,
        name: 'ТОО «KAZ Chemical Supply»',
        address: 'г. Алматы, пр. Райымбека 120',
        email: 'sales@kazchem.kz',
        phone: '+7 (727) 345-67-89',
        paymentTerms: '100% постоплата в течение 30 календарных дней',
        paymentForm: 'Безналичный расчет (KZT)',
        bidSecurity: Math.round(defaultAmount * 0.01),
        discountPercent: 3,
        order: 0,
        isSelected: true
      },
      {
        id: supp2Id,
        name: 'ТОО «ПромСнаб Астана»',
        address: 'г. Астана, ул. Бейбитшилик 25',
        email: 'info@promsnab.kz',
        phone: '+7 (7172) 78-90-12',
        paymentTerms: '30% аванс, 70% по факту поставки',
        paymentForm: 'Безналичный расчет (KZT)',
        bidSecurity: Math.round(defaultAmount * 0.01),
        discountPercent: 0,
        order: 1,
        isSelected: false
      },
      {
        id: supp3Id,
        name: 'ООО «РосСнаб Экспорт»',
        address: 'РФ, г. Москва, Варшавское шоссе 42',
        email: 'export@rossnab.ru',
        phone: '+7 (495) 123-45-67',
        paymentTerms: '100% предоплата перед отгрузкой',
        paymentForm: 'Безналичный расчет (RUB)',
        bidSecurity: 0,
        discountPercent: 0,
        order: 2,
        isSelected: false
      }
    ];

    const defaultLineItems: ComparisonLineItemData[] = [
      {
        id: 'item-1',
        order: 1,
        mpzCode: 'EL-004921',
        name: dbTender.title || 'Антифриз высококачественный G12 (или эквивалент)',
        unit: 'л',
        quantity: 5000,
        budgetPriceKzt0: Math.round((defaultBudget0 / 5000) * 100) / 100,
        budgetPriceKzt12: Math.round((defaultBudget12 / 5000) * 100) / 100,
        prices: {
          [supp1Id]: {
            lineItemId: 'item-1',
            supplierId: supp1Id,
            proposedName: 'Антифриз Nord Frost G12 (-40°C)',
            priceKzt0: Math.round((defaultBudget0 / 5000) * 0.82 * 100) / 100,
            priceKzt12: Math.round((defaultBudget12 / 5000) * 0.82 * 100) / 100,
            priceRub0: Math.round(((defaultBudget0 / 5000) * 0.82 / defaultExchangeRate) * 100) / 100,
            currency: 'KZT'
          },
          [supp2Id]: {
            lineItemId: 'item-1',
            supplierId: supp2Id,
            proposedName: 'Антифриз SINTEC LUX G12',
            priceKzt0: Math.round((defaultBudget0 / 5000) * 0.88 * 100) / 100,
            priceKzt12: Math.round((defaultBudget12 / 5000) * 0.88 * 100) / 100,
            priceRub0: Math.round(((defaultBudget0 / 5000) * 0.88 / defaultExchangeRate) * 100) / 100,
            currency: 'KZT'
          },
          [supp3Id]: {
            lineItemId: 'item-1',
            supplierId: supp3Id,
            proposedName: 'Антифриз Тосол-Синтез Felix Pro',
            priceKzt0: Math.round(((defaultBudget0 / 5000) * 0.75) * 100) / 100,
            priceKzt12: Math.round(((defaultBudget12 / 5000) * 0.75) * 100) / 100,
            priceRub0: Math.round(((defaultBudget0 / 5000) * 0.75 / defaultExchangeRate) * 100) / 100,
            currency: 'RUB'
          }
        }
      }
    ];

    const seeded: TenderSupplierComparisonData = {
      tenderId,
      companyId: company?.id,
      tenderTitle: dbTender.title,
      tenderNumber: dbTender.externalId,
      tradingPlatform: dbTender.source || 'goszakup.gov.kz',
      customerName: dbTender.customerName,
      customerBin: dbTender.customerBin,
      publishDate: dbTender.publishDate ? new Date(dbTender.publishDate).toISOString() : undefined,
      deadlineDate: dbTender.deadlineDate ? new Date(dbTender.deadlineDate).toISOString() : undefined,
      exchangeRate: defaultExchangeRate,
      notes: 'Сравнение коммерческих предложений поставщиков по закупке.',
      selectedSupplierId: supp1Id,
      creditAmount: Math.round(defaultAmount * 0.4),
      creditDays: 60,
      creditCost: Math.round(defaultAmount * 0.4 * 0.18 * (60 / 365)),
      suppliers: defaultSuppliers,
      lineItems: defaultLineItems
    };

    const { totalBudgetKzt0, totalBudgetKzt12, summaries } = SupplierComparisonService.computeSummaries(seeded, defaultAmount);

    return {
      ...seeded,
      totalBudgetKzt0,
      totalBudgetKzt12,
      summaries
    };
  }

  /**
   * Saves updated supplier comparison data to DB
   */
  static async saveComparison(tenderId: string, userId: string, payload: TenderSupplierComparisonData): Promise<TenderSupplierComparisonData> {
    let company = await resolveOwnCompanyProfile(userId);
    if (!company) {
      company = { id: 'temp-comp-id', companyName: 'Моя компания', bin: '123456789012' } as any;
    }

    try {
      if (company.id && !company.id.startsWith('temp-')) {
        await prisma.$transaction(async (tx) => {
          // 1. Upsert comparison header
          const comparison = await tx.tenderSupplierComparison.upsert({
            where: {
              tenderId_companyId: {
                tenderId,
                companyId: company.id
              }
            },
            update: {
              exchangeRate: payload.exchangeRate || 5.20,
              notes: payload.notes || null,
              selectedSupplierId: payload.selectedSupplierId || null,
              creditAmount: payload.creditAmount != null ? payload.creditAmount : null,
              creditDays: payload.creditDays != null ? payload.creditDays : null,
              creditCost: payload.creditCost != null ? payload.creditCost : null
            },
            create: {
              tenderId,
              companyId: company.id,
              organizationId: company.organizationId || null,
              exchangeRate: payload.exchangeRate || 5.20,
              notes: payload.notes || null,
              selectedSupplierId: payload.selectedSupplierId || null,
              creditAmount: payload.creditAmount != null ? payload.creditAmount : null,
              creditDays: payload.creditDays != null ? payload.creditDays : null,
              creditCost: payload.creditCost != null ? payload.creditCost : null
            }
          });

          // 2. Delete existing suppliers and lineItems for clean replacement
          await tx.comparisonSupplierPrice.deleteMany({
            where: {
              supplier: { comparisonId: comparison.id }
            }
          });
          await tx.comparisonLineItem.deleteMany({
            where: { comparisonId: comparison.id }
          });
          await tx.comparisonSupplier.deleteMany({
            where: { comparisonId: comparison.id }
          });

          // 3. Create Suppliers
          const supplierIdMap = new Map<string, string>(); // oldId / frontendId => new DB ID
          for (let i = 0; i < payload.suppliers.length; i++) {
            const s = payload.suppliers[i];
            const created = await tx.comparisonSupplier.create({
              data: {
                comparisonId: comparison.id,
                name: s.name,
                address: s.address || null,
                email: s.email || null,
                phone: s.phone || null,
                paymentTerms: s.paymentTerms || null,
                paymentForm: s.paymentForm || null,
                bidSecurity: s.bidSecurity != null ? s.bidSecurity : null,
                discountPercent: s.discountPercent != null ? s.discountPercent : 0,
                order: i,
                isSelected: !!s.isSelected || payload.selectedSupplierId === s.id
              }
            });
            if (s.id) supplierIdMap.set(s.id, created.id);
            supplierIdMap.set(s.name, created.id);
          }

          // 4. Create Line Items & Prices
          for (let r = 0; r < payload.lineItems.length; r++) {
            const item = payload.lineItems[r];
            const createdItem = await tx.comparisonLineItem.create({
              data: {
                comparisonId: comparison.id,
                order: r + 1,
                mpzCode: item.mpzCode || null,
                name: item.name,
                unit: item.unit || 'шт',
                quantity: item.quantity || 1,
                budgetPriceKzt0: item.budgetPriceKzt0 != null ? item.budgetPriceKzt0 : null,
                budgetPriceKzt12: item.budgetPriceKzt12 != null ? item.budgetPriceKzt12 : null
              }
            });

            // Create prices for this item
            for (const [suppKey, pData] of Object.entries(item.prices || {})) {
              const targetSuppDbId = supplierIdMap.get(suppKey) || supplierIdMap.get(pData.supplierId);
              if (targetSuppDbId) {
                await tx.comparisonSupplierPrice.create({
                  data: {
                    lineItemId: createdItem.id,
                    supplierId: targetSuppDbId,
                    proposedName: pData.proposedName || null,
                    priceKzt0: pData.priceKzt0 != null ? pData.priceKzt0 : null,
                    priceKzt12: pData.priceKzt12 != null ? pData.priceKzt12 : null,
                    priceRub0: pData.priceRub0 != null ? pData.priceRub0 : null,
                    currency: pData.currency || 'KZT'
                  }
                });
              }
            }
          }
        });
      }
    } catch (err: any) {
      console.warn('[SupplierComparisonService] DB save error (using returned payload):', err?.message);
    }

    const { totalBudgetKzt0, totalBudgetKzt12, summaries } = SupplierComparisonService.computeSummaries(payload);
    return {
      ...payload,
      totalBudgetKzt0,
      totalBudgetKzt12,
      summaries
    };
  }
}
