require('tsx/cjs');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { GoszakupApiAdapter } = require('../../src/lib/ingestion/goszakup.adapter');
const { GET: checkSubmittedResultsGET } = require('../../src/app/api/cron/check-submitted-tender-results/route');

console.log('🧪 Starting Submitted Tender Results Tracking Test Suite...\n');

async function testGoszakupAdapterFetchBuyResult() {
  console.log('1️⃣ Testing GoszakupApiAdapter.fetchBuyResult...');
  const adapter = new GoszakupApiAdapter();

  const wonResult = await adapter.fetchBuyResult('987150-2026-won');
  assert.ok(wonResult, 'wonResult should not be null');
  assert.strictEqual(wonResult.isFinished, true, 'wonResult.isFinished should be true');
  assert.ok(wonResult.winnerBin, 'wonResult should contain winnerBin');
  console.log('   ✅ fetchBuyResult returns finished status for WON tender');

  const lostResult = await adapter.fetchBuyResult('987150-2026-lost');
  assert.ok(lostResult, 'lostResult should not be null');
  assert.strictEqual(lostResult.isFinished, true, 'lostResult.isFinished should be true');
  console.log('   ✅ fetchBuyResult returns finished status for LOST tender');

  const pendingResult = await adapter.fetchBuyResult('987150-2026-pending');
  assert.ok(pendingResult, 'pendingResult should not be null');
  assert.strictEqual(pendingResult.isFinished, false, 'pendingResult.isFinished should be false');
  console.log('   ✅ fetchBuyResult returns isFinished = false for PENDING tender');
}

async function testCronSecurityAndExecution() {
  console.log('\n2️⃣ Testing Cron Route Security & Execution (/api/cron/check-submitted-tender-results)...');
  const origSecret = process.env.CRON_SECRET;

  // Test 2.1: Missing CRON_SECRET yields 500
  delete process.env.CRON_SECRET;
  const reqNoSecret = {
    headers: new Map(),
    url: 'http://localhost/api/cron/check-submitted-tender-results'
  };
  reqNoSecret.headers.get = () => null;

  const res500 = await checkSubmittedResultsGET(reqNoSecret);
  assert.strictEqual(res500.status, 500, 'Missing CRON_SECRET must return HTTP 500');
  console.log('   ✅ Missing CRON_SECRET returns HTTP 500 Server misconfiguration');

  // Test 2.2: Invalid CRON_SECRET yields 401
  process.env.CRON_SECRET = 'valid-test-secret-123';
  const reqInvalidSecret = {
    headers: new Map([['x-cron-secret', 'invalid-secret']]),
    url: 'http://localhost/api/cron/check-submitted-tender-results'
  };
  reqInvalidSecret.headers.get = (name) => name.toLowerCase() === 'x-cron-secret' ? 'invalid-secret' : null;

  const res401 = await checkSubmittedResultsGET(reqInvalidSecret);
  assert.strictEqual(res401.status, 401, 'Invalid CRON_SECRET must return HTTP 401');
  console.log('   ✅ Invalid X-Cron-Secret header returns HTTP 401 Unauthorized');

  // Test 2.3: Valid secret yields 200
  const reqValidSecret = {
    headers: new Map([['x-cron-secret', 'valid-test-secret-123']]),
    url: 'http://localhost/api/cron/check-submitted-tender-results'
  };
  reqValidSecret.headers.get = (name) => name.toLowerCase() === 'x-cron-secret' ? 'valid-test-secret-123' : null;

  const res200 = await checkSubmittedResultsGET(reqValidSecret);
  assert.strictEqual(res200.status, 200, 'Valid CRON_SECRET must return HTTP 200');
  const data200 = await res200.json();
  assert.strictEqual(data200.success, true, 'Response success must be true');
  console.log('   ✅ Valid X-Cron-Secret header returns HTTP 200 OK and executes cron job');

  process.env.CRON_SECRET = origSecret;
}

async function testVercelCronRegistration() {
  console.log('\n3️⃣ Testing vercel.json Registration...');
  const vercelJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'vercel.json'), 'utf8'));
  const resultsCron = vercelJson.crons.find(c => c.path === '/api/cron/check-submitted-tender-results');

  assert.ok(resultsCron, 'vercel.json must include /api/cron/check-submitted-tender-results entry');
  assert.strictEqual(resultsCron.schedule, '0 6,18 * * *', 'Schedule must be set to "0 6,18 * * *"');
  console.log('   ✅ vercel.json contains /api/cron/check-submitted-tender-results with schedule "0 6,18 * * *"');
}

async function testUnresolvedProfileSkipping() {
  console.log('\n4️⃣ Testing Unresolved Profile Skipping (No Fallback BIN)...');
  const { prisma } = require('../../src/lib/prisma');
  const origFindMany = prisma.kanbanCard.findMany;

  try {
    prisma.kanbanCard.findMany = async () => [
      {
        id: 'test-card-no-profile',
        userId: null,
        organizationId: null,
        tender: { externalId: '987150-2026-won', title: 'Test Tender' }
      }
    ];

    process.env.CRON_SECRET = 'valid-test-secret-123';
    const req = {
      headers: new Map([['x-cron-secret', 'valid-test-secret-123']]),
      url: 'http://localhost/api/cron/check-submitted-tender-results'
    };
    req.headers.get = (name) => name.toLowerCase() === 'x-cron-secret' ? 'valid-test-secret-123' : null;

    const res = await checkSubmittedResultsGET(req);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.wonCount, 0, 'Card without resolved profile must NOT be counted as won');
    assert.strictEqual(data.pendingCount, 1, 'Card without resolved profile must be skipped and counted as pending');
    console.log('   ✅ Card with unresolvable company profile is safely skipped as pending');
  } finally {
    prisma.kanbanCard.findMany = origFindMany;
  }
}

async function runAll() {
  try {
    await testGoszakupAdapterFetchBuyResult();
    await testCronSecurityAndExecution();
    await testVercelCronRegistration();
    await testUnresolvedProfileSkipping();
    console.log('\n🎉 Submitted Tender Results Tracking Test Suite completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Test Failure:', err);
    process.exit(1);
  }
}

runAll();
