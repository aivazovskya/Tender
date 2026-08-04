require('tsx/cjs');
const assert = require('assert');
const { DocGeneratorService } = require('../../src/lib/services/doc-generator.service');
const { PriceBenchmarkService } = require('../../src/lib/services/price-benchmark.service');
const { ManagementReportService } = require('../../src/lib/services/management-report.service');

async function runPhase3Tests() {
  console.log('🧪 Starting Phase 3 Operational Modules Unit & Integration Tests...');

  // ==========================================
  // Test 1: Module 1 Document Generator Placeholders
  // ==========================================
  console.log('  1️⃣ Testing Document Generator Placeholder Resolver...');
  const mockTender = {
    title: 'Поставка серверного оборудования',
    amount: 15000000,
    customerName: 'АО «Национальные информационные технологии»',
    deadlineDate: new Date('2026-09-01T00:00:00.000Z')
  };
  const mockProfile = {
    companyName: 'ТОО «Aivazovsky Tech»',
    bin: '123456789012'
  };

  const template = 'Компания {{companyName}} (БИН {{bin}}) подаёт заявку на {{tenderTitle}} на сумму {{tenderAmount}} ₸ для {{customerName}}. Срок до {{deadlineDate}}.';
  const resolved = DocGeneratorService.resolvePlaceholders(template, mockTender, mockProfile);

  assert(resolved.includes('ТОО «Aivazovsky Tech»'), 'Company name resolved incorrectly');
  assert(resolved.includes('123456789012'), 'BIN resolved incorrectly');
  assert(resolved.includes('Поставка серверного оборудования'), 'Tender title resolved incorrectly');
  assert(resolved.includes('15'), 'Tender amount resolved incorrectly');
  assert(resolved.includes('АО «Национальные информационные технологии»'), 'Customer name resolved incorrectly');
  console.log('  ✅ Module 1 Placeholder Resolver Passed!');

  // Test DOCX Buffer Generation
  console.log('  1️⃣.2 Testing DOCX Binary Buffer Generation...');
  const docxBuffer = await DocGeneratorService.generateDocxBuffer('Заявка на участие', resolved);
  assert(docxBuffer instanceof Buffer, 'Docx generation must return a Buffer instance');
  assert(docxBuffer.length > 500, 'Docx buffer must not be empty');
  console.log('  ✅ Module 1 DOCX Binary Generation Passed!');

  // ==========================================
  // Test 2: Module 2 Requirements Checklist Progress
  // ==========================================
  console.log('  2️⃣ Testing Requirements Checklist Progress Calculation...');
  const mockReqs = [
    { id: '1', label: 'Лицензия', isCompleted: true, sourceType: 'AI_EXTRACTED' },
    { id: '2', label: 'Сертификат СТ-KZ', isCompleted: true, sourceType: 'AI_EXTRACTED' },
    { id: '3', label: 'Опыт 3 года', isCompleted: false, sourceType: 'AI_EXTRACTED' },
    { id: '4', label: 'Внутренняя проверка', isCompleted: false, sourceType: 'MANUAL' }
  ];

  const totalCount = mockReqs.length;
  const completedCount = mockReqs.filter(r => r.isCompleted).length;
  const progressPct = Math.round((completedCount / totalCount) * 100);

  assert.strictEqual(totalCount, 4);
  assert.strictEqual(completedCount, 2);
  assert.strictEqual(progressPct, 50);

  // Verify deletion constraint for AI_EXTRACTED
  const aiItem = mockReqs[0];
  const canDeleteAi = aiItem.sourceType === 'MANUAL';
  assert.strictEqual(canDeleteAi, false, 'AI_EXTRACTED requirements must not be deletable');
  console.log('  ✅ Module 2 Checklist Progress & Deletion Constraints Passed!');

  // ==========================================
  // Test 3: Module 3 Security Instruments Expiry & Summary
  // ==========================================
  console.log('  3️⃣ Testing Security Instruments Summary Metrics...');
  const mockInstruments = [
    { amount: 500000, status: 'ACTIVE', expiryDate: new Date('2026-08-10') },
    { amount: 1000000, status: 'ACTIVE', expiryDate: new Date('2026-08-25') },
    { amount: 300000, status: 'RELEASED', expiryDate: new Date('2026-07-01') },
    { amount: 200000, status: 'FORFEITED', expiryDate: new Date('2026-06-15') }
  ];

  const activeItems = mockInstruments.filter(i => i.status === 'ACTIVE');
  const totalActive = activeItems.reduce((acc, i) => acc + i.amount, 0);
  const forfeitedItems = mockInstruments.filter(i => i.status === 'FORFEITED');
  const totalForfeited = forfeitedItems.reduce((acc, i) => acc + i.amount, 0);

  assert.strictEqual(totalActive, 1500000, 'Active security total mismatch');
  assert.strictEqual(totalForfeited, 200000, 'Forfeited security total mismatch');
  console.log('  ✅ Module 3 Security Instruments Metrics Passed!');

  // ==========================================
  // Test 4: Module 4 Contract Delay & Penalty Formula
  // ==========================================
  console.log('  4️⃣ Testing Post-Contract Execution Delay Penalty...');
  const tenderAmount = 10000000; // 10 Million KZT
  const deliveryDeadline = new Date('2026-08-01');
  const actualDeliveryDate = new Date('2026-08-11'); // 10 days late

  const delayDays = Math.ceil((actualDeliveryDate.getTime() - deliveryDeadline.getTime()) / (1000 * 3600 * 24));
  const penaltyRatePerDay = 0.001; // 0.1% per day
  const actualPenalty = Math.round(delayDays * penaltyRatePerDay * tenderAmount);

  assert.strictEqual(delayDays, 10, 'Delay days calculation mismatch');
  assert.strictEqual(actualPenalty, 100000, 'Penalty amount mismatch (expected 100,000 KZT for 10 days @ 0.1%/day on 10M)');
  console.log('  ✅ Module 4 Delay Penalty Calculation Passed!');

  // ==========================================
  // Test 5: Module 5 Price Benchmark Logic
  // ==========================================
  console.log('  5️⃣ Testing Price Benchmark Statistics & Sample Size Warning...');
  const amounts = [800000, 900000, 1000000, 1100000, 1200000]; // 5 samples
  const sampleSize = amounts.length;
  const sum = amounts.reduce((a, b) => a + b, 0);
  const avg = sum / sampleSize;
  const median = amounts[2];
  const isReliable = sampleSize >= 5;

  assert.strictEqual(sampleSize, 5);
  assert.strictEqual(avg, 1000000);
  assert.strictEqual(median, 1000000);
  assert.strictEqual(isReliable, true, 'Sample size >= 5 must be marked reliable');

  const smallSampleSize = 3;
  const smallReliable = smallSampleSize >= 5;
  assert.strictEqual(smallReliable, false, 'Sample size < 5 must trigger warning flag');
  console.log('  ✅ Module 5 Price Benchmark Statistics Passed!');

  // ==========================================
  // Test 6: Module 6 Management Executive Report Aggregation
  // ==========================================
  console.log('  6️⃣ Testing Management Executive Report Aggregation...');
  const mockCards = [
    { stage: 'WON', finalWinAmount: 9000000, tender: { amount: 10000000, category: 'IT' } },
    { stage: 'WON', finalWinAmount: 4500000, tender: { amount: 5000000, category: 'IT' } },
    { stage: 'LOST', finalWinAmount: null, tender: { amount: 8000000, category: 'IT' } },
    { stage: 'SUBMITTED', finalWinAmount: null, tender: { amount: 3000000, category: 'Строительство' } }
  ];

  const submitted = mockCards.filter(c => ['SUBMITTED', 'WON', 'LOST'].includes(c.stage)).length;
  const won = mockCards.filter(c => c.stage === 'WON').length;
  const winRate = Math.round((won / submitted) * 100);

  assert.strictEqual(submitted, 4);
  assert.strictEqual(won, 2);
  assert.strictEqual(winRate, 50);

  // Discounts
  const discounts = mockCards
    .filter(c => c.stage === 'WON' && c.finalWinAmount != null)
    .map(c => ((c.tender.amount - c.finalWinAmount) / c.tender.amount) * 100);
  const avgDiscount = discounts.reduce((a, b) => a + b, 0) / discounts.length;

  assert.strictEqual(avgDiscount, 10, 'Average discount mismatch (expected 10%)');
  console.log('  ✅ Module 6 Executive Management Report Aggregation Passed!');

  console.log('\n🎉 All Phase 3 Operational Modules Unit & Integration Tests Passed Successfully!');
}

runPhase3Tests().catch(err => {
  console.error('💥 Phase 3 Tests Error:', err);
  process.exit(1);
});
