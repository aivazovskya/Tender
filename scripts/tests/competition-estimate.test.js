require('tsx/cjs');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { CompetitionService } = require('../../src/lib/services/competition.service');
const { GET } = require('../../src/app/api/tenders/competition/route');
const { POST } = require('../../src/app/api/notifications/recompute-stats/route');

async function runTests() {
  console.log('🧪 [Test Suite] Testing Competition & Win Probability Engine (Phase 1 / Task #3)...\n');

  // Helper for mock HTTP requests
  function createMockReq(urlStr, headersObj = {}) {
    return {
      url: urlStr,
      headers: {
        get: (key) => headersObj[key.toLowerCase()] || headersObj[key] || null
      }
    };
  }

  // --- Test 1: Single Source Procurement (Criteria #1) ---
  console.log('▶ 1. Testing Single Source Procurement (SINGLE_SOURCE)...');
  const singleSourceTender = {
    id: 't-single-001',
    externalId: '10001',
    title: 'Закупка услуг авторского надзора из одного источника',
    category: 'Услуги',
    region: 'г. Алматы',
    procurementMethod: 'SINGLE_SOURCE',
    amount: 5000000,
    currency: 'KZT',
    publishDate: new Date().toISOString(),
    deadlineDate: new Date().toISOString(),
    status: 'ACTIVE',
    source: 'GOSZAKUP',
    sourceUrl: 'https://goszakup.gov.kz',
    riskScore: 0,
    riskFlags: [],
    documents: [],
    history: []
  };

  const est1 = await CompetitionService.estimate(singleSourceTender);
  assert.strictEqual(est1.competitionLevel, 'LOW', 'SINGLE_SOURCE competitionLevel must be LOW');
  assert.strictEqual(est1.estimatedParticipants, 1, 'SINGLE_SOURCE estimatedParticipants must be 1');
  assert.strictEqual(est1.isSingleSource, true, 'isSingleSource must be true');
  assert.strictEqual(est1.confidence, 'HIGH', 'SINGLE_SOURCE confidence must be HIGH');
  assert.strictEqual(est1.winProbability, null, 'winProbability must be null for SINGLE_SOURCE');
  assert.strictEqual(est1.winProbabilityReason, 'single_source', 'winProbabilityReason must be single_source');
  assert(est1.basis.includes('из одного источника'), 'basis must describe single source');
  console.log('  ✅ SINGLE_SOURCE handled correctly (LOW competition, 1 participant, winProbability = null)!');

  // --- Test 2: Competitive Method & Financial Heuristic Fallback (Criteria #2 & #4) ---
  console.log('\n▶ 2. Testing Competitive Method & Financial Heuristic Fallback (Criteria #2 & #4)...');
  const openTenderSmall = {
    id: 't-open-002',
    externalId: '10002',
    title: 'Поставка офисной бумаги',
    category: 'Бумага',
    region: 'Карагандинская область',
    procurementMethod: 'OPEN_TENDER',
    amount: 3000000, // Small amount < 10M
    currency: 'KZT',
    publishDate: new Date().toISOString(),
    deadlineDate: new Date().toISOString(),
    status: 'ACTIVE',
    source: 'GOSZAKUP',
    sourceUrl: 'https://goszakup.gov.kz',
    riskScore: 10,
    riskFlags: [],
    documents: [],
    history: []
  };

  const est2 = await CompetitionService.estimate(openTenderSmall);
  assert.strictEqual(est2.isSingleSource, false);
  assert.strictEqual(est2.confidence, 'LOW', 'Fallback heuristic confidence must be LOW');
  assert(typeof est2.basis === 'string' && est2.basis.length > 0, 'basis must not be empty');
  assert(typeof est2.sampleSize === 'number', 'sampleSize must be present');
  console.log('  ✅ Fallback heuristic returns LOW confidence and explicit basis!');

  // --- Test 3: Personal Win Probability Hard Threshold (Criteria #3) ---
  console.log('\n▶ 3. Testing Personal Win Probability Hard Threshold (4 vs 5 deals)...');
  
  // 3a. User with 4 completed deals (< 5) -> winProbability = null, reason = 'insufficient_history'
  const mockUserDeals4 = {
    getUserCategoryDeals: async () => ({ total: 4, won: 2, lost: 2 })
  };
  const originalGetUserCategoryDeals = CompetitionService.getUserCategoryDeals;
  CompetitionService.getUserCategoryDeals = mockUserDeals4.getUserCategoryDeals;

  const est4Deals = await CompetitionService.estimate(openTenderSmall, { companyName: 'Test', bin: '180940004512', activities: '', keywords: [], regions: [], minAmount: 0, maxAmount: 0, contactEmail: '' }, 'user-4-deals');
  assert.strictEqual(est4Deals.winProbability, null, 'Win probability must be null for 4 completed deals (< 5)');
  assert.strictEqual(est4Deals.winProbabilityReason, 'insufficient_history', 'Reason must be insufficient_history');
  console.log('  ✅ 4 completed deals (< 5 threshold) correctly returns winProbability = null + insufficient_history!');

  // 3b. User with 5 completed deals (>= 5) -> winProbability = calculated % (3 won out of 5 = 60%)
  const mockUserDeals5 = {
    getUserCategoryDeals: async () => ({ total: 5, won: 3, lost: 2 })
  };
  CompetitionService.getUserCategoryDeals = mockUserDeals5.getUserCategoryDeals;

  const est5Deals = await CompetitionService.estimate(openTenderSmall, { companyName: 'Test', bin: '180940004512', activities: '', keywords: [], regions: [], minAmount: 0, maxAmount: 0, contactEmail: '' }, 'user-5-deals');
  assert.strictEqual(est5Deals.winProbability, 60, 'Win probability must be 60% for 3 won out of 5 deals');
  assert.strictEqual(est5Deals.winProbabilityReason, 'calculated', 'Reason must be calculated');
  console.log('  ✅ 5 completed deals (>= 5 threshold) correctly returns winProbability = 60%!');

  // Restore original method
  CompetitionService.getUserCategoryDeals = originalGetUserCategoryDeals;

  // --- Test 4: Privacy Guard for Small Sample Size (Criteria #5) ---
  console.log('\n▶ 4. Testing Privacy Guard for Small Sample Size (sampleSize < 3)...');
  assert.strictEqual(est2.hideDetailedCounts, true, 'sampleSize < 3 must set hideDetailedCounts = true');
  console.log('  ✅ Privacy guard hides detailed counts when sampleSize < 3!');

  // --- Test 5: Recompute Stats Cron Security Authorization (Criteria #6) ---
  console.log('\n▶ 5. Testing Recompute Stats Cron Security Authorization (Criteria #6)...');
  
  // 5a. Unauthorized request (missing secret in production mode simulation)
  const unauthReq = createMockReq('http://localhost/api/notifications/recompute-stats', { 'x-cron-secret': 'wrong-secret' });
  process.env.NODE_ENV = 'production';
  process.env.CRON_SECRET = 'valid-secret-2026';

  const unauthRes = await POST(unauthReq);
  assert.strictEqual(unauthRes.status, 401, 'Unauthorized cron request must return HTTP 401');
  console.log('  ✅ Recompute stats cron endpoint returns HTTP 401 without valid X-Cron-Secret!');

  // 5b. Authorized request
  const authReq = createMockReq('http://localhost/api/notifications/recompute-stats', { 'x-cron-secret': 'valid-secret-2026' });
  const authRes = await POST(authReq);
  assert.strictEqual(authRes.status, 200, 'Authorized cron request must return HTTP 200');
  const authData = await authRes.json();
  assert.strictEqual(authData.success, true);
  console.log('  ✅ Authorized recompute stats request executed successfully (HTTP 200 OK)!');

  // Reset env
  delete process.env.NODE_ENV;
  delete process.env.CRON_SECRET;

  // --- Test 6: Verify Research Spike & README Documentation (Criteria #7) ---
  console.log('\n▶ 6. Verifying Research Spike & Module 9 Documentation in README.md (Criteria #7)...');
  const readmeContent = fs.readFileSync(path.join(process.cwd(), 'README.md'), 'utf8');
  assert(readmeContent.includes('Module 9'), 'README.md must document Module 9');
  assert(readmeContent.includes('Research Spike'), 'README.md must mention Research Spike findings');
  console.log('  ✅ README.md explicitly documents Module 9 & Goszakup GraphQL Research Spike!');

  console.log('\n🎉 Competition & Win Probability Engine Test Suite completed successfully!');
}

runTests().catch(err => {
  console.error('💥 Test failed:', err);
  process.exit(1);
});
