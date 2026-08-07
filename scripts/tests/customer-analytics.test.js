require('tsx/cjs');
const assert = require('assert');
const { CustomerAnalyticsService } = require('../../src/lib/services/customer-analytics.service');
const { GET: getCustomerStatsGET } = require('../../src/app/api/customers/[bin]/stats/route');
const { POST: postCustomerWinnersPOST } = require('../../src/app/api/customers/[bin]/winners/route');
const { prisma } = require('../../src/lib/prisma');

console.log('🧪 Starting Customer Procurement History Analytics Test Suite...\n');

async function testBINValidation() {
  console.log('1️⃣ Testing BIN format validation...');
  try {
    await CustomerAnalyticsService.getInternalCustomerStats('12345');
    assert.fail('Should have thrown error for invalid BIN format');
  } catch (err) {
    assert.ok(err.message.includes('12 цифр'), 'Error should mention 12-digit requirement');
    console.log('   ✅ Throws error on invalid 5-digit BIN');
  }
}

async function testInternalStatsCalculation() {
  console.log('\n2️⃣ Testing Internal Customer Stats Aggregation (2.1)...');
  const testBin = '050240003412';
  const now = new Date();
  const date1 = new Date(now.getTime() - 10 * 24 * 3600 * 1000);
  const date2 = new Date(now.getTime() - 20 * 24 * 3600 * 1000);

  const origFindMany = prisma.tender.findMany;
  try {
    prisma.tender.findMany = async ({ where }) => {
      if (where?.customerBin === testBin) {
        return [
          {
            id: 't-1',
            source: 'GOSZAKUP',
            externalId: 'ext-1',
            customerBin: testBin,
            customerName: 'Тестовый Заказчик Астаны',
            category: 'ИТ и ПО',
            industryTags: ['ПО', 'Образование'],
            region: 'г. Астана',
            procurementMethod: 'OPEN_TENDER',
            amount: 10000000,
            publishDate: date1
          },
          {
            id: 't-2',
            source: 'GOSZAKUP',
            externalId: 'ext-2',
            customerBin: testBin,
            customerName: 'Тестовый Заказчик Астаны',
            category: 'ИТ и ПО',
            industryTags: ['ПО', 'Серверы'],
            region: 'г. Астана',
            procurementMethod: 'PRICE_PROPOSAL',
            amount: 20000000,
            publishDate: date2
          }
        ];
      }
      return [];
    };

    const stats = await CustomerAnalyticsService.getInternalCustomerStats(testBin);
    assert.strictEqual(stats.customerBin, testBin);
    assert.strictEqual(stats.customerName, 'Тестовый Заказчик Астаны');
    assert.strictEqual(stats.totalTendersCount, 2);
    assert.strictEqual(stats.totalAmountSum, 30000000);
    assert.strictEqual(stats.avgAmount, 15000000);
    assert.strictEqual(stats.medianAmount, 15000000);
    assert.strictEqual(stats.categoryBreakdown['ИТ и ПО'].count, 2);
    assert.strictEqual(stats.categoryBreakdown['ИТ и ПО'].percent, 100);
    assert.strictEqual(stats.industryTagsBreakdown['ПО'].count, 2);
    assert.strictEqual(stats.regionBreakdown['г. Астана'].count, 2);
    assert.strictEqual(stats.procurementMethodBreakdown['OPEN_TENDER'].count, 1);
    assert.strictEqual(stats.procurementMethodBreakdown['PRICE_PROPOSAL'].count, 1);
    assert.strictEqual(stats.avgDaysBetweenTenders, 10);
    console.log('   ✅ Accurately aggregates 12-month internal procurement stats, median, and publication frequency');
  } finally {
    prisma.tender.findMany = origFindMany;
  }
}

async function testCustomerReputationIntegration() {
  console.log('\n3️⃣ Testing Customer Reputation Integration (2.2)...');
  const testBin = '050240003412';
  const reputation = await CustomerAnalyticsService.getCustomerReputation(testBin);

  assert.ok(reputation, 'Reputation result should be defined');
  assert.strictEqual(reputation.bin, testBin);
  assert.strictEqual(reputation.entityType, 'CUSTOMER');
  assert.ok(['CLEAN', 'BLACKLISTED', 'UNKNOWN'].includes(reputation.status));
  console.log('   ✅ Successfully invokes ReputationService.checkBin with CUSTOMER entity type');
}

async function testCustomerWinnersCaching() {
  console.log('\n4️⃣ Testing Lazy Customer Winners Cache (2.3)...');
  const testBin = '050240003412';
  const origFindManyTenders = prisma.tender.findMany;
  const origFindManyCache = prisma.customerWinnerCache.findMany;
  const origDeleteManyCache = prisma.customerWinnerCache.deleteMany;
  const origCreateManyCache = prisma.customerWinnerCache.createMany;

  try {
    prisma.customerWinnerCache.findMany = async () => [];
    prisma.customerWinnerCache.deleteMany = async () => ({ count: 0 });
    prisma.customerWinnerCache.createMany = async () => ({ count: 1 });

    prisma.tender.findMany = async ({ where }) => {
      if (where?.customerBin === testBin) {
        return [
          {
            id: 't-1',
            externalId: '987150-2026-won',
            customerBin: testBin,
            publishDate: new Date()
          }
        ];
      }
      return [];
    };

    // First call: cache miss, triggers mock adapter
    const winners1 = await CustomerAnalyticsService.getOrFetchCustomerWinners(testBin);
    assert.strictEqual(winners1.customerBin, testBin);
    assert.strictEqual(winners1.cached, false, 'First call must be a cache miss');
    assert.strictEqual(winners1.sampleSize, 1);
    assert.ok(winners1.winners.length > 0, 'Winners list should contain aggregated winner');
    console.log('   ✅ Cache miss correctly fetches winner details');

    // Second call: simulate DB cache returning stored winner
    const now = new Date();
    prisma.customerWinnerCache.findMany = async () => [
      {
        id: 'c-1',
        customerBin: testBin,
        winnerBin: '123456789012',
        winnerName: 'Поставщик 123456789012',
        tenderCount: 1,
        sampleSize: 1,
        checkedAt: now
      }
    ];

    const winners2 = await CustomerAnalyticsService.getOrFetchCustomerWinners(testBin);
    assert.strictEqual(winners2.cached, true, 'Second call must return cached result');
    assert.strictEqual(winners2.winners[0].winnerBin, '123456789012');
    console.log('   ✅ Cache hit returns cached winner analysis within 24h TTL');
  } finally {
    prisma.tender.findMany = origFindManyTenders;
    prisma.customerWinnerCache.findMany = origFindManyCache;
    prisma.customerWinnerCache.deleteMany = origDeleteManyCache;
    prisma.customerWinnerCache.createMany = origCreateManyCache;
  }
}

async function testApiRoutes() {
  console.log('\n5️⃣ Testing API Routes (/api/customers/[bin]/stats & /api/customers/[bin]/winners)...');

  // Test Invalid BIN
  const reqInvalid = {
    headers: new Map([['x-user-id', 'test-user-id']]),
    url: 'http://localhost/api/customers/invalid-bin/stats'
  };
  reqInvalid.headers.get = (name) => name.toLowerCase() === 'x-user-id' ? 'test-user-id' : null;

  const resInvalidStats = await getCustomerStatsGET(reqInvalid, { params: Promise.resolve({ bin: 'invalid-bin' }) });
  assert.strictEqual(resInvalidStats.status, 400, 'Invalid BIN format must return HTTP 400');
  console.log('   ✅ GET /api/customers/invalid-bin/stats returns HTTP 400 Invalid BIN');

  // Test Valid BIN Stats
  const reqValid = {
    headers: new Map([['x-user-id', 'test-user-id']]),
    url: 'http://localhost/api/customers/050240003412/stats'
  };
  reqValid.headers.get = (name) => name.toLowerCase() === 'x-user-id' ? 'test-user-id' : null;

  const resValidStats = await getCustomerStatsGET(reqValid, { params: Promise.resolve({ bin: '050240003412' }) });
  assert.strictEqual(resValidStats.status, 200, 'Valid request must return HTTP 200');
  const statsData = await resValidStats.json();
  assert.strictEqual(statsData.success, true);
  assert.ok(statsData.data.stats, 'Response must contain stats');
  assert.ok(statsData.data.reputation, 'Response must contain reputation');
  console.log('   ✅ GET /api/customers/050240003412/stats returns HTTP 200 with stats & reputation');

  // Test Valid BIN Winners
  const resValidWinners = await postCustomerWinnersPOST(reqValid, { params: Promise.resolve({ bin: '050240003412' }) });
  assert.strictEqual(resValidWinners.status, 200, 'Valid request must return HTTP 200');
  const winnersData = await resValidWinners.json();
  assert.strictEqual(winnersData.success, true);
  assert.ok(winnersData.data.winners, 'Response must contain winners list');
  console.log('   ✅ POST /api/customers/050240003412/winners returns HTTP 200 with winners data');
}

async function runAll() {
  try {
    await testBINValidation();
    await testInternalStatsCalculation();
    await testCustomerReputationIntegration();
    await testCustomerWinnersCaching();
    await testApiRoutes();
    console.log('\n🎉 Customer Procurement History Analytics Test Suite completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Test Failure:', err);
    process.exit(1);
  }
}

runAll();
