require('tsx/cjs');
const assert = require('assert');
const path = require('path');

// Run tests for Tender Calculation module logic
console.log('🧪 Running Tender Calculation Unit & Logic Tests...');

const { roundMoney, TenderCalculationService } = require('../../src/lib/services/tender-calculation.service');

async function runTests() {
  // 1. Test Financial Precision Rounding
  console.log('  1. Testing Money Rounding Precision...');
  assert.strictEqual(roundMoney(100.1234), 100.12);
  assert.strictEqual(roundMoney(100.1256), 100.13);
  assert.strictEqual(roundMoney('50000.559'), 50000.56);
  assert.strictEqual(roundMoney(0), 0);

  // 2. Test Formula Recalculation Engine
  console.log('  2. Testing Calculation Engine Formulas...');
  const mockCalculationId = 'calc-test-101';
  
  // Mock Prisma client transaction object
  const mockCalcState = {
    id: mockCalculationId,
    tenderId: 'tender-1',
    companyId: 'company-1',
    startPrice: 1000000,
    targetMarginPct: 15,
    minMarginPct: 5,
    riskAdjustedMarginPct: null,
    recommendedPrice: 1000000,
    minAcceptablePrice: 1000000,
    biddingRoomPct: 0,
    biddingRoomAmount: 0,
    costItems: [
      {
        id: 'item-1',
        calculationId: mockCalculationId,
        category: 'PURCHASE',
        label: 'Товар',
        valueType: 'PERCENTAGE',
        amount: 70, // 70% of 1,000,000 = 700,000
        baseAmount: 1000000,
        computedAmount: 700000
      },
      {
        id: 'item-2',
        calculationId: mockCalculationId,
        category: 'LOGISTICS',
        label: 'Доставка',
        valueType: 'FIXED',
        amount: 50000, // 50,000
        baseAmount: null,
        computedAmount: 50000
      }
    ],
    tender: {
      id: 'tender-1',
      amount: 1000000,
      riskScore: 20,
      riskScoringStatus: 'AI_SCORED'
    }
  };

  let updatedCalcResult = null;
  const mockTx = {
    tenderCalculation: {
      findUnique: async () => mockCalcState,
      update: async ({ data }) => {
        updatedCalcResult = { ...mockCalcState, ...data };
        return updatedCalcResult;
      }
    },
    tenderCostItem: {
      update: async ({ where, data }) => {
        const item = mockCalcState.costItems.find(i => i.id === where.id);
        if (item) item.computedAmount = parseFloat(data.computedAmount.toString());
      }
    }
  };

  const result = await TenderCalculationService.recalculate(mockCalculationId, mockTx);
  
  // Total cost = 700,000 + 50,000 = 750,000
  assert.strictEqual(parseFloat(updatedCalcResult.totalCost.toString()), 750000);
  
  // Recommended Price = 750,000 * 1.15 = 862,500
  assert.strictEqual(parseFloat(updatedCalcResult.recommendedPrice.toString()), 862500);

  // Min Acceptable Price = 750,000 * 1.05 = 787,500
  assert.strictEqual(parseFloat(updatedCalcResult.minAcceptablePrice.toString()), 787500);

  // Bidding room amount = 1,000,000 - 787,500 = 212,500
  assert.strictEqual(parseFloat(updatedCalcResult.biddingRoomAmount.toString()), 212500);

  // Bidding room pct = (212,500 / 1,000,000) * 100 = 21.25%
  assert.strictEqual(parseFloat(updatedCalcResult.biddingRoomPct.toString()), 21.25);

  // Risk adjusted margin pct should be defined when riskScore is present
  assert.notStrictEqual(updatedCalcResult.riskAdjustedMarginPct, null);
  console.log(`     Computed Risk-Adjusted Margin: ${updatedCalcResult.riskAdjustedMarginPct}% (Target: 15%)`);

  // 3. Test Loss-Making Scenario Detection
  console.log('  3. Testing Loss-Making Scenario (biddingRoomAmount < 0)...');
  mockCalcState.costItems.push({
    id: 'item-3',
    calculationId: mockCalculationId,
    category: 'LABOR',
    label: 'Дополнительные работы',
    valueType: 'FIXED',
    amount: 300000,
    baseAmount: null,
    computedAmount: 300000
  });

  await TenderCalculationService.recalculate(mockCalculationId, mockTx);
  // Total cost = 750,000 + 300,000 = 1,050,000
  // Min acceptable price = 1,050,000 * 1.05 = 1,102,500
  // Bidding room amount = 1,000,000 - 1,102,500 = -102,500
  assert.strictEqual(parseFloat(updatedCalcResult.totalCost.toString()), 1050000);
  assert.strictEqual(parseFloat(updatedCalcResult.biddingRoomAmount.toString()), -102500);
  assert.strictEqual(parseFloat(updatedCalcResult.biddingRoomAmount.toString()) < 0, true);

  // 4. Test Null Risk State Handling
  console.log('  4. Testing Null Risk State Handling when riskScore is missing...');
  delete mockCalcState.tender.riskScore;
  await TenderCalculationService.recalculate(mockCalculationId, mockTx);
  assert.strictEqual(updatedCalcResult.riskAdjustedMarginPct, null);

  console.log('✅ All Tender Calculation unit & logic tests passed successfully!');
}

runTests().catch(err => {
  console.error('💥 Test execution error:', err);
  process.exit(1);
});
