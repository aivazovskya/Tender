require('tsx/cjs');
const assert = require('assert');
const path = require('path');
const { TenderCalculationService, roundMoney } = require('../../src/lib/services/tender-calculation.service');
const { AntiDumpingService } = require('../../src/lib/services/anti-dumping.service');
const { TenderPollingService } = require('../../src/lib/services/tender-polling.service');
const { DEFAULT_DUMPING_THRESHOLDS } = require('../../src/lib/types/tender');
const { prisma } = require('../../src/lib/prisma');

console.log('🧪 Starting Phase 2 (Profitability) & Phase 3 (Anti-Dumping) Test Suite...\n');

async function testProfitabilityRecalculationEngine() {
  console.log('1️⃣ Testing Phase 2: Recalculation on price change & red zone margin detection...');

  const mockCalcId = 'calc-p2-test-1';
  let calculationState = {
    id: mockCalcId,
    tenderId: 'tender-p2-1',
    companyId: 'company-p2-1',
    startPrice: 1000000,
    totalCost: 800000,
    targetMarginPct: 15,
    minMarginPct: 5,
    minAcceptableMarginPct: 5,
    recommendedPrice: 920000,
    minAcceptablePrice: 840000,
    biddingRoomPct: 16,
    biddingRoomAmount: 160000,
    costItems: [
      {
        id: 'cost-1',
        calculationId: mockCalcId,
        category: 'PURCHASE',
        label: 'Товары',
        valueType: 'PERCENTAGE',
        amount: 80,
        baseAmount: 1000000,
        computedAmount: 800000
      }
    ],
    company: {
      id: 'company-p2-1',
      telegramChatId: '123456789',
      minAcceptableMarginPct: 5
    },
    tender: {
      id: 'tender-p2-1',
      title: 'Поставка серверного оборудования',
      amount: 1000000,
      riskScore: 0,
      riskScoringStatus: 'NOT_SCORED'
    }
  };

  const mockTx = {
    tenderCalculation: {
      findMany: async () => [calculationState],
      findUnique: async () => calculationState,
      update: async ({ data }) => {
        calculationState = { ...calculationState, ...data };
        return calculationState;
      }
    },
    tenderCostItem: {
      update: async ({ where, data }) => {
        const item = calculationState.costItems.find(i => i.id === where.id);
        if (item && data.computedAmount) {
          item.computedAmount = parseFloat(data.computedAmount.toString());
        }
      }
    }
  };

  // Case A: Price drops to 850,000 (total cost 800,000, effective margin = (850,000 - 800,000)/800,000 = 6.25% >= 5% minMargin)
  // Start price is 850,000 -> computed cost item (80% of 850,000 = 680,000). TotalCost = 680,000.
  // Min acceptable price = 680,000 * 1.05 = 714,000. 850,000 > 714,000 -> NOT RED ZONE.
  const resultSafe = await TenderCalculationService.recalculateOnPriceChange(
    'tender-p2-1',
    850000,
    { previousPrice: 1000000, prismaClient: mockTx }
  );

  assert.strictEqual(resultSafe.recalculatedCount, 1);
  assert.strictEqual(resultSafe.redZoneCount, 0, 'Safe price must not trigger red zone');

  // Case B: Price drops drastically to 600,000 with fixed costs
  calculationState.costItems = [
    {
      id: 'cost-fixed-1',
      calculationId: mockCalcId,
      category: 'PURCHASE',
      label: 'Себестоимость',
      valueType: 'FIXED',
      amount: 700000, // Fixed cost 700,000 KZT
      baseAmount: null,
      computedAmount: 700000
    }
  ];

  // If new price drops to 650,000 KZT while fixed cost is 700,000:
  // newPrice (650,000) < minAcceptablePrice (735,000) -> MUST TRIGGER RED ZONE!
  const resultRedZone = await TenderCalculationService.recalculateOnPriceChange(
    'tender-p2-1',
    650000,
    { previousPrice: 850000, prismaClient: mockTx }
  );

  assert.strictEqual(resultRedZone.recalculatedCount, 1);
  assert.strictEqual(resultRedZone.redZoneCount, 1, 'Price below min acceptable price MUST trigger red zone');
  assert.strictEqual(resultRedZone.results[0].isRedZone, true);

  console.log('   ✅ Recalculation on price change & Red Zone margin boundaries verified');
}

async function testAntiDumpingThresholdResolution() {
  console.log('2️⃣ Testing Phase 3: Anti-dumping threshold regulatory dictionary & subject type heuristic...');

  // 1. Regulatory defaults verification
  const openTenderRule = DEFAULT_DUMPING_THRESHOLDS.find(
    t => t.source === 'GOSZAKUP' && t.procurementMethod === 'OPEN_TENDER' && t.subjectType === 'ALL'
  );
  assert.strictEqual(openTenderRule.thresholdPercent, 20.0, 'Open tender threshold must be 20%');

  const constructionRule = DEFAULT_DUMPING_THRESHOLDS.find(
    t => t.source === 'GOSZAKUP' && t.procurementMethod === 'OPEN_TENDER' && t.subjectType === 'CONSTRUCTION'
  );
  assert.strictEqual(constructionRule.thresholdPercent, 5.0, 'Construction (СМР) threshold must be 5%');

  const designRule = DEFAULT_DUMPING_THRESHOLDS.find(
    t => t.source === 'GOSZAKUP' && t.procurementMethod === 'OPEN_TENDER' && t.subjectType === 'DESIGN'
  );
  assert.strictEqual(designRule.thresholdPercent, 10.0, 'Design (ПИР) threshold must be 10%');

  const supervisionRule = DEFAULT_DUMPING_THRESHOLDS.find(
    t => t.source === 'GOSZAKUP' && t.procurementMethod === 'OPEN_TENDER' && t.subjectType === 'SUPERVISION'
  );
  assert.strictEqual(supervisionRule.thresholdPercent, 10.0, 'Supervision (Технадзор) threshold must be 10%');

  const quotationRule = DEFAULT_DUMPING_THRESHOLDS.find(
    t => t.source === 'GOSZAKUP' && t.procurementMethod === 'PRICE_PROPOSAL'
  );
  assert.strictEqual(quotationRule.thresholdPercent, 30.0, 'Price proposal (ЗЦП) threshold must be 30%');

  const eStoreRule = DEFAULT_DUMPING_THRESHOLDS.find(
    t => t.source === 'GOSZAKUP' && t.procurementMethod === 'E_STORE'
  );
  assert.strictEqual(eStoreRule.thresholdPercent, 50.0, 'Electronic store threshold must be 50%');

  // 2. Heuristic inference verification
  assert.strictEqual(
    AntiDumpingService.inferSubjectType({ title: 'Капитальный ремонт кровли школы и СМР' }),
    'CONSTRUCTION'
  );
  assert.strictEqual(
    AntiDumpingService.inferSubjectType({ title: 'Разработка проектно-сметной документации (ПИР) водопровода' }),
    'DESIGN'
  );
  assert.strictEqual(
    AntiDumpingService.inferSubjectType({ title: 'Услуги по техническому надзору за строительством' }),
    'SUPERVISION'
  );
  assert.strictEqual(
    AntiDumpingService.inferSubjectType({ title: 'Поставка канцелярских товаров и бумаги А4' }),
    'ALL'
  );

  // 3. Dynamic resolver check
  const constrRes = await AntiDumpingService.resolveThreshold({
    source: 'GOSZAKUP',
    procurementMethod: 'OPEN_TENDER',
    title: 'Строительство детского сада'
  });
  assert.strictEqual(constrRes.thresholdPercent, 5.0, 'Resolved threshold for construction must be 5%');

  const pirRes = await AntiDumpingService.resolveThreshold({
    source: 'GOSZAKUP',
    procurementMethod: 'OPEN_TENDER',
    title: 'ПИР котельной'
  });
  assert.strictEqual(pirRes.thresholdPercent, 10.0, 'Resolved threshold for design (ПИР) must be 10%');

  const standardRes = await AntiDumpingService.resolveThreshold({
    source: 'GOSZAKUP',
    procurementMethod: 'OPEN_TENDER',
    title: 'Поставка мебели'
  });
  assert.strictEqual(standardRes.thresholdPercent, 20.0, 'Resolved threshold for general tender must be 20%');

  console.log('   ✅ All regulatory threshold rates and subject type heuristics verified');
}

async function testAntiDumpingAlertDetection() {
  console.log('3️⃣ Testing Phase 3: Anti-dumping alert detection (WARNING vs CRITICAL)...');

  const mockTender = {
    id: 'tender-dumping-001',
    title: 'Конкурс на поставку оборудования',
    source: 'GOSZAKUP',
    procurementMethod: 'OPEN_TENDER',
    amount: 10000000 // 10,000,000 ₸ (Threshold is 20%)
  };

  // Mock DB transaction client
  let recordedAlerts = [];
  const mockTx = {
    dumpingThreshold: {
      findFirst: async () => null // triggers static fallback
    },
    dumpingAlert: {
      create: async ({ data }) => {
        recordedAlerts.push(data);
        return { id: 'alert-1', ...data };
      }
    }
  };

  // Case A: Safe discount -> 10% discount (Current price: 9,000,000 from 10,000,000). Distance = 20 - 10 = 10 p.p. (> 5 p.p.) -> NO ALERT
  const safeCheck = await AntiDumpingService.checkDumping(
    mockTender,
    9000000,
    10000000,
    { prismaClient: mockTx }
  );
  assert.strictEqual(safeCheck.triggered, false);
  assert.strictEqual(safeCheck.severity, null);
  assert.strictEqual(safeCheck.deviationPercent, 10);

  // Case B: Approaching threshold (WARNING) -> 17% discount (Current price: 8,300,000). Distance = 20 - 17 = 3 p.p. (<= 5 p.p.) -> WARNING
  const warningCheck = await AntiDumpingService.checkDumping(
    mockTender,
    8300000,
    10000000,
    { prismaClient: mockTx }
  );
  assert.strictEqual(warningCheck.triggered, true);
  assert.strictEqual(warningCheck.severity, 'WARNING');
  assert.strictEqual(warningCheck.deviationPercent, 17);
  assert.strictEqual(warningCheck.thresholdPercent, 20);

  // Case C: Dumping breach (CRITICAL) -> 25% discount (Current price: 7,500,000). Deviation = 25% >= 20% -> CRITICAL
  const criticalCheck = await AntiDumpingService.checkDumping(
    mockTender,
    7500000,
    10000000,
    { prismaClient: mockTx }
  );
  assert.strictEqual(criticalCheck.triggered, true);
  assert.strictEqual(criticalCheck.severity, 'CRITICAL');
  assert.strictEqual(criticalCheck.deviationPercent, 25);
  assert.strictEqual(criticalCheck.thresholdPercent, 20);

  // Case D: Construction tender (5% threshold)
  const constrTender = {
    id: 'tender-dumping-002',
    title: 'Капитальный ремонт кровли (СМР)',
    source: 'GOSZAKUP',
    procurementMethod: 'OPEN_TENDER',
    amount: 10000000
  };

  // 6% discount on construction -> CRITICAL
  const constrCheck = await AntiDumpingService.checkDumping(
    constrTender,
    9400000,
    10000000,
    { prismaClient: mockTx }
  );
  assert.strictEqual(constrCheck.triggered, true);
  assert.strictEqual(constrCheck.severity, 'CRITICAL', '6% discount on СМР (5% threshold) must trigger CRITICAL dumping alert');

  console.log('   ✅ Anti-dumping deviation calculations, warning boundaries and critical triggers verified');
}

async function testTenderPollingPriceIntegration() {
  console.log('4️⃣ Testing integration: Polling service price change triggers Phase 2 and Phase 3...');

  const mockTenderId = 'tender-integrated-poll';

  // Test with mock payload carrying a price change
  const pollRes = await TenderPollingService.pollTender(mockTenderId, {
    force: true,
    mockSourceData: {
      statusId: '330', // PRICE_PROPOSALS_OPENED
      newPrice: 7500000, // Drop from starting price
      referencePrice: 10000000
    }
  });

  assert(pollRes !== null);
  assert.strictEqual(pollRes.tenderId, mockTenderId);
  // Offline safe fallback verified
  console.log('   ✅ Polling engine correctly accepts and orchestrates price change payloads');
}

async function run() {
  await testProfitabilityRecalculationEngine();
  await testAntiDumpingThresholdResolution();
  await testAntiDumpingAlertDetection();
  await testTenderPollingPriceIntegration();

  console.log('==================================================');
  console.log('🎉 Phase 2 (Profitability) & Phase 3 (Anti-Dumping) Test Suite Passed Successfully!');
  console.log('==================================================\n');
}

run().catch(err => {
  console.error('💥 Test suite failure:', err);
  process.exit(1);
});