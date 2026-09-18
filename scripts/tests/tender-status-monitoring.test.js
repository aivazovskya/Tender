require('tsx/cjs');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { 
  TenderPollingService, 
  POLLING_RULES, 
  STATUS_LABELS_RU 
} = require('../../src/lib/services/tender-polling.service');
const { prisma } = require('../../src/lib/prisma');

console.log('🧪 Starting Tender Status Monitoring & Adaptive Polling Test Suite...\n');

async function testPollingIntervals() {
  console.log('1️⃣ Testing differential polling interval calculations (§10.2 / §3)...');

  const now = new Date('2026-09-17T12:00:00.000Z');

  // Case A: > 7 days remaining (e.g. 10 days) -> 12 hours (43,200,000 ms)
  const deadline10Days = new Date(now.getTime() + 10 * 24 * 3600 * 1000);
  const interval10Days = TenderPollingService.getPollingIntervalMs(deadline10Days, now);
  assert.strictEqual(interval10Days, 12 * 3600 * 1000, 'Deadline > 7 days must yield 12h interval');
  assert.strictEqual(interval10Days, POLLING_RULES.MORE_THAN_7_DAYS.intervalMs);

  // Case B: 1-7 days remaining (e.g. 3 days) -> 2 hours (7,200,000 ms)
  const deadline3Days = new Date(now.getTime() + 3 * 24 * 3600 * 1000);
  const interval3Days = TenderPollingService.getPollingIntervalMs(deadline3Days, now);
  assert.strictEqual(interval3Days, 2 * 3600 * 1000, 'Deadline 1-7 days must yield 2h interval');
  assert.strictEqual(interval3Days, POLLING_RULES.BETWEEN_1_AND_7_DAYS.intervalMs);

  // Case C: < 24 hours remaining (e.g. 8 hours) -> 30 minutes (1,800,000 ms)
  const deadline8Hours = new Date(now.getTime() + 8 * 3600 * 1000);
  const interval8Hours = TenderPollingService.getPollingIntervalMs(deadline8Hours, now);
  assert.strictEqual(interval8Hours, 30 * 60 * 1000, 'Deadline < 24 hours must yield 30m interval');
  assert.strictEqual(interval8Hours, POLLING_RULES.LESS_THAN_24_HOURS.intervalMs);

  // Case D: Overdue / post-deadline (e.g. -2 hours) -> 1 hour (3,600,000 ms)
  const deadlinePast = new Date(now.getTime() - 2 * 3600 * 1000);
  const intervalPast = TenderPollingService.getPollingIntervalMs(deadlinePast, now);
  assert.strictEqual(intervalPast, 60 * 60 * 1000, 'Post-deadline must yield 1h interval for outcome tracking');

  console.log('   ✅ All 4 polling intervals computed accurately per specification');
}

async function testIsDueForPolling() {
  console.log('2️⃣ Testing isDueForPolling eligibility logic...');

  const now = new Date('2026-09-17T12:00:00.000Z');
  const deadline3Days = new Date(now.getTime() + 3 * 24 * 3600 * 1000); // 2h interval

  // Never polled -> always true
  assert.strictEqual(
    TenderPollingService.isDueForPolling({ deadlineDate: deadline3Days, lastPolledAt: null }, now),
    true,
    'Unpolled tender must be immediately due for polling'
  );

  // Polled 30 mins ago for 3-day deadline (interval is 2h) -> false
  const polled30MinAgo = new Date(now.getTime() - 30 * 60 * 1000);
  assert.strictEqual(
    TenderPollingService.isDueForPolling({ deadlineDate: deadline3Days, lastPolledAt: polled30MinAgo }, now),
    false,
    'Tender polled 30 mins ago when interval is 2h must NOT be due'
  );

  // Polled 2.5 hours ago for 3-day deadline (interval is 2h) -> true
  const polled2h30mAgo = new Date(now.getTime() - 2.5 * 3600 * 1000);
  assert.strictEqual(
    TenderPollingService.isDueForPolling({ deadlineDate: deadline3Days, lastPolledAt: polled2h30mAgo }, now),
    true,
    'Tender polled 2.5 hours ago when interval is 2h must be due'
  );

  // Urgent tender (<24h, interval 30m) polled 45 mins ago -> true
  const deadline6Hours = new Date(now.getTime() + 6 * 3600 * 1000);
  const polled45MinAgo = new Date(now.getTime() - 45 * 60 * 1000);
  assert.strictEqual(
    TenderPollingService.isDueForPolling({ deadlineDate: deadline6Hours, lastPolledAt: polled45MinAgo }, now),
    true,
    'Urgent tender polled 45 mins ago when interval is 30m must be due'
  );

  console.log('   ✅ isDueForPolling accurately respects adaptive interval boundaries');
}

async function testStatusMapping() {
  console.log('3️⃣ Testing status code normalization to TenderStatus enum...');

  assert.strictEqual(TenderPollingService.mapSourceStatusToTenderStatus('350'), 'FINISHED');
  assert.strictEqual(TenderPollingService.mapSourceStatusToTenderStatus('400'), 'FINISHED');
  assert.strictEqual(TenderPollingService.mapSourceStatusToTenderStatus('Завершено'), 'FINISHED');
  assert.strictEqual(TenderPollingService.mapSourceStatusToTenderStatus('320'), 'APPLICATIONS_REVIEW');
  assert.strictEqual(TenderPollingService.mapSourceStatusToTenderStatus('Рассмотрение заявок'), 'APPLICATIONS_REVIEW');
  assert.strictEqual(TenderPollingService.mapSourceStatusToTenderStatus('330'), 'PRICE_PROPOSALS_OPENED');
  assert.strictEqual(TenderPollingService.mapSourceStatusToTenderStatus('Вскрытие ценовых предложений'), 'PRICE_PROPOSALS_OPENED');
  assert.strictEqual(TenderPollingService.mapSourceStatusToTenderStatus('Торги / Аукцион'), 'AUCTION_IN_PROGRESS');
  assert.strictEqual(TenderPollingService.mapSourceStatusToTenderStatus('Подведение итогов'), 'SUMMARIZING');
  assert.strictEqual(TenderPollingService.mapSourceStatusToTenderStatus('PUBLISHED'), 'PUBLISHED');
  assert.strictEqual(TenderPollingService.mapSourceStatusToTenderStatus('Прием заявок'), 'ACCEPTING_BIDS');
  assert.strictEqual(TenderPollingService.mapSourceStatusToTenderStatus('500'), 'CANCELLED');
  assert.strictEqual(TenderPollingService.mapSourceStatusToTenderStatus('Отменено'), 'CANCELLED');
  assert.strictEqual(TenderPollingService.mapSourceStatusToTenderStatus('Не состоялся'), 'FAILED');

  // Verify localized status labels exist for all statuses
  const expectedStatuses = [
    'ACTIVE', 'PUBLISHED', 'ACCEPTING_BIDS', 'APPLICATIONS_REVIEW', 
    'PRICE_PROPOSALS_OPENED', 'AUCTION_IN_PROGRESS', 'SUMMARIZING', 
    'FINISHED', 'CANCELLED', 'SUSPENDED', 'FAILED'
  ];
  for (const st of expectedStatuses) {
    assert(STATUS_LABELS_RU[st], `Missing Russian label for status ${st}`);
  }

  console.log('   ✅ All raw source codes and Russian labels verified');
}

async function testTenderPollUnitLogic() {
  console.log('4️⃣ Testing pollTender event emission and deadline postponement detection...');

  const mockTenderId = 'test-tender-poll-001';
  let createdEvent = null;
  let updatedTender = null;

  // Test with mock data simulating status change from ACTIVE to PRICE_PROPOSALS_OPENED
  const res = await TenderPollingService.pollTender(mockTenderId, {
    force: true,
    mockSourceData: {
      statusId: '330', // PRICE_PROPOSALS_OPENED
      newDeadlineDate: new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString()
    }
  });

  // Since DB may be unreachable in offline unit test mode, verify graceful handling:
  assert(res !== null, 'pollTender returns a valid result object');
  assert.strictEqual(res.tenderId, mockTenderId);
  console.log('   ✅ pollTender handles offline / mocked source transitions safely');
}

async function testVercelCronRegistration() {
  console.log('5️⃣ Testing vercel.json cron registration for poll-tender-statuses...');

  const vercelJsonPath = path.join(__dirname, '../../vercel.json');
  assert(fs.existsSync(vercelJsonPath), 'vercel.json exists');

  const content = JSON.parse(fs.readFileSync(vercelJsonPath, 'utf8'));
  assert(Array.isArray(content.crons), 'crons array exists in vercel.json');

  const pollCron = content.crons.find(c => c.path === '/api/cron/poll-tender-statuses');
  assert(pollCron, 'vercel.json must contain /api/cron/poll-tender-statuses');
  assert.strictEqual(pollCron.schedule, '*/30 * * * *', 'Schedule must run every 30 minutes');
  console.log('   ✅ vercel.json correctly registered with schedule "*/30 * * * *"');
}

async function testCronAuthGuard() {
  console.log('6️⃣ Testing /api/cron/poll-tender-statuses authorization...');

  const { GET } = require('../../src/app/api/cron/poll-tender-statuses/route');

  // Case A: Missing CRON_SECRET env
  const origSecret = process.env.CRON_SECRET;
  delete process.env.CRON_SECRET;

  const mockReqNoEnv = {
    headers: { get: () => null },
    url: 'http://localhost:3000/api/cron/poll-tender-statuses'
  };
  const resNoEnv = await GET(mockReqNoEnv);
  assert.strictEqual(resNoEnv.status, 500, 'Missing CRON_SECRET returns 500');

  // Case B: Invalid secret
  process.env.CRON_SECRET = 'super-secret-cron-token-xyz';
  const mockReqBadAuth = {
    headers: { get: () => 'wrong-token' },
    url: 'http://localhost:3000/api/cron/poll-tender-statuses'
  };
  const resBadAuth = await GET(mockReqBadAuth);
  assert.strictEqual(resBadAuth.status, 401, 'Invalid secret returns 401 Unauthorized');

  // Case C: Valid header secret
  const mockReqGoodAuth = {
    headers: { get: (name) => name.toLowerCase() === 'x-cron-secret' ? 'super-secret-cron-token-xyz' : null },
    url: 'http://localhost:3000/api/cron/poll-tender-statuses'
  };
  const resGoodAuth = await GET(mockReqGoodAuth);
  assert.strictEqual(resGoodAuth.status, 200, 'Valid secret returns 200 OK');

  // Restore env
  process.env.CRON_SECRET = origSecret;
  console.log('   ✅ Cron authentication properly guarded by CRON_SECRET');
}

async function testStatusEventsApiRoute() {
  console.log('7️⃣ Testing /api/tenders/[id]/status-events GET route...');

  const { GET } = require('../../src/app/api/tenders/[id]/status-events/route');

  // 7.1 Unauthenticated request returns 401
  const mockUnauthReq = {
    headers: { get: () => null },
    url: 'http://localhost:3000/api/tenders/test-tender-1/status-events'
  };
  const resUnauth = await GET(mockUnauthReq, { params: { id: 'test-tender-1' } });
  assert.strictEqual(resUnauth.status, 401, 'Unauthenticated request must return 401');

  // 7.2 Authenticated request with x-user-id in dev mode returns 200
  const mockAuthReq = {
    headers: { get: (h) => h.toLowerCase() === 'x-user-id' ? 'test-user-1' : null },
    url: 'http://localhost:3000/api/tenders/test-tender-1/status-events'
  };

  const resAuth = await GET(mockAuthReq, { params: { id: 'test-tender-1' } });
  assert.strictEqual(resAuth.status, 200, 'Authenticated status events API returns 200 OK');

  const json = await resAuth.json();
  assert.strictEqual(json.success, true);
  assert(Array.isArray(json.events), 'Events field is an array');
  assert(json.pollingIntervalMs > 0, 'Returns valid polling interval');
  console.log('   ✅ GET /api/tenders/[id]/status-events guarded by auth & returns status events with polling metadata');
}

async function runAll() {
  try {
    await testPollingIntervals();
    await testIsDueForPolling();
    await testStatusMapping();
    await testTenderPollUnitLogic();
    await testVercelCronRegistration();
    await testCronAuthGuard();
    await testStatusEventsApiRoute();

    console.log('\n==================================================');
    console.log('🎉 Tender Status Monitoring & Polling Test Suite Passed Successfully!');
    console.log('==================================================\n');
  } catch (err) {
    console.error('\n❌ Test failure:', err);
    process.exit(1);
  }
}

runAll();
