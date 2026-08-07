require('tsx/cjs');
const assert = require('assert');
process.env.AUTH_STORE_MODE = 'memory';

const { CashFlowService } = require('../../src/lib/services/cash-flow.service');
const { GET: getSummaryGET } = require('../../src/app/api/finance/cash-flow-summary/route');
const { GET: getTimelineGET } = require('../../src/app/api/finance/cash-flow-timeline/route');

console.log('🧪 Starting Cash Flow & Deposit Frozen Funds Tracking Test Suite...\n');

async function testCashFlowSummaryLogic() {
  console.log('1️⃣ Testing CashFlowService.getCashFlowSummary deposit vs guarantee isolation...');
  const companyProfileId = 'demo-company-profile-id';
  CashFlowService.clearMemoryStore();

  const now = new Date();

  // Seed 1: Bid Security Deposit (Frozen)
  CashFlowService.seedMemoryInstrument({
    id: 'inst-1',
    companyProfileId,
    type: 'BID_SECURITY_DEPOSIT',
    amount: 1000000,
    status: 'ACTIVE',
    expiryDate: new Date(now.getTime() + 5 * 24 * 3600 * 1000)
  });

  // Seed 2: Performance Bond Deposit (Frozen)
  CashFlowService.seedMemoryInstrument({
    id: 'inst-2',
    companyProfileId,
    type: 'PERFORMANCE_BOND_DEPOSIT',
    amount: 3000000,
    status: 'ACTIVE',
    expiryDate: new Date(now.getTime() + 20 * 24 * 3600 * 1000)
  });

  // Seed 3: Bank Guarantee (Non-cash / Unfrozen)
  CashFlowService.seedMemoryInstrument({
    id: 'inst-3',
    companyProfileId,
    type: 'BID_SECURITY_BANK_GUARANTEE',
    amount: 5000000,
    status: 'ACTIVE',
    expiryDate: new Date(now.getTime() + 45 * 24 * 3600 * 1000)
  });

  // Seed 4: Released Deposit (Inactive)
  CashFlowService.seedMemoryInstrument({
    id: 'inst-4',
    companyProfileId,
    type: 'BID_SECURITY_DEPOSIT',
    amount: 2000000,
    status: 'RELEASED',
    expiryDate: new Date(now.getTime() - 5 * 24 * 3600 * 1000)
  });

  const summary = await CashFlowService.getCashFlowSummary(companyProfileId);

  assert.strictEqual(summary.companyProfileId, companyProfileId);
  assert.strictEqual(summary.currency, 'KZT');
  assert.strictEqual(summary.totalFrozenCash, 4000000, 'Total frozen cash must only sum ACTIVE deposits (1M + 3M = 4M)');
  assert.strictEqual(summary.totalUnfrozenGuarantees, 5000000, 'Total unfrozen guarantees must equal active bank guarantees (5M)');
  assert.strictEqual(summary.activeInstrumentsCount, 3);
  assert.strictEqual(summary.breakdown.bidSecurityDepositAmount, 1000000);
  assert.strictEqual(summary.breakdown.performanceBondDepositAmount, 3000000);
  assert.strictEqual(summary.breakdown.bidSecurityGuaranteeAmount, 5000000);
  console.log('   ✅ getCashFlowSummary correctly isolates frozen deposit cash from bank guarantees');
}

async function testCashFlowTimelineForecast() {
  console.log('\n2️⃣ Testing CashFlowService.getCashFlowTimeline forecast & horizon grouping...');
  const companyProfileId = 'demo-company-profile-id';

  const timelineResult = await CashFlowService.getCashFlowTimeline(companyProfileId);

  assert.strictEqual(timelineResult.companyProfileId, companyProfileId);
  assert.strictEqual(timelineResult.totalFrozenCash, 4000000);
  assert.ok(timelineResult.disclaimer.includes('плановой датой'), 'Must contain planned date disclaimer');
  assert.strictEqual(timelineResult.timeline.length, 2, 'Timeline must only contain active deposit instruments');

  // Verify ASC order
  assert.ok(
    new Date(timelineResult.timeline[0].expiryDate) <= new Date(timelineResult.timeline[1].expiryDate),
    'Timeline entries must be sorted by expiryDate ASC'
  );

  // Horizons validation: inst-1 is +5 days (thisWeek), inst-2 is +20 days (next30Days)
  assert.strictEqual(timelineResult.horizons.thisWeekAmount, 1000000);
  assert.strictEqual(timelineResult.horizons.thisWeekCount, 1);
  assert.strictEqual(timelineResult.horizons.next30DaysAmount, 3000000);
  assert.strictEqual(timelineResult.horizons.next30DaysCount, 1);
  assert.strictEqual(timelineResult.horizons.after30DaysAmount, 0);
  console.log('   ✅ getCashFlowTimeline correctly sorts deposits by expiryDate ASC and groups by horizons');
}

async function testCashFlowApiRoutes() {
  console.log('\n3️⃣ Testing API Routes (/api/finance/cash-flow-summary & /api/finance/cash-flow-timeline)...');

  const req = {
    headers: new Map([['x-user-id', 'demo-user-id']]),
    url: 'http://localhost/api/finance/cash-flow-summary'
  };
  req.headers.get = (name) => name.toLowerCase() === 'x-user-id' ? 'demo-user-id' : null;

  // Test Summary GET
  const resSummary = await getSummaryGET(req);
  assert.strictEqual(resSummary.status, 200);
  const dataSummary = await resSummary.json();
  assert.strictEqual(dataSummary.success, true);
  assert.strictEqual(dataSummary.data.totalFrozenCash, 4000000);
  console.log('   ✅ GET /api/finance/cash-flow-summary returns HTTP 200 with company liquidity summary');

  // Test Timeline GET
  const reqTimeline = {
    headers: new Map([['x-user-id', 'demo-user-id']]),
    url: 'http://localhost/api/finance/cash-flow-timeline'
  };
  reqTimeline.headers.get = (name) => name.toLowerCase() === 'x-user-id' ? 'demo-user-id' : null;

  const resTimeline = await getTimelineGET(reqTimeline);
  assert.strictEqual(resTimeline.status, 200);
  const dataTimeline = await resTimeline.json();
  assert.strictEqual(dataTimeline.success, true);
  assert.ok(dataTimeline.data.disclaimer.length > 0);
  assert.strictEqual(dataTimeline.data.timeline.length, 2);
  console.log('   ✅ GET /api/finance/cash-flow-timeline returns HTTP 200 with forecast release timeline');
}

async function runAll() {
  try {
    await testCashFlowSummaryLogic();
    await testCashFlowTimelineForecast();
    await testCashFlowApiRoutes();
    console.log('\n🎉 Cash Flow & Deposit Frozen Funds Tracking Test Suite completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Test Failure:', err);
    process.exit(1);
  }
}

runAll();
