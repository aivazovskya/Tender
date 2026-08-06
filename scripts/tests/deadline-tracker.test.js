require('tsx/cjs');
const assert = require('assert');

const { DeadlineService } = require('../../src/lib/services/deadline.service');
const { GET: getDeadlines, POST: createDeadline } = require('../../src/app/api/deadlines/route');
const { PATCH: updateDeadline } = require('../../src/app/api/deadlines/[id]/route');
const { GET: getDeadlinesSummary } = require('../../src/app/api/deadlines/summary/route');
const { GET: cronCheckDeadlines } = require('../../src/app/api/cron/check-upcoming-deadlines/route');

process.env.AUTH_STORE_MODE = 'memory';

console.log('🧪 Starting Deadline Tracker with Prioritization Test Suite...\n');

function createMockReq(urlStr, options = {}) {
  const headers = options.headers || {};
  const cookies = options.cookies || {};
  return {
    url: urlStr,
    headers: {
      get: (key) => headers[key.toLowerCase()] || headers[key] || null
    },
    cookies: {
      get: (key) => (cookies[key] !== undefined ? { value: cookies[key] } : undefined)
    },
    json: async () => options.body || {}
  };
}

async function runTests() {
  const testCompanyId = 'demo-company-profile-id';
  const testTenderId = 't_deadline_101';

  // Seed memory tender for calculations
  DeadlineService.seedMemoryTender({
    id: testTenderId,
    title: 'Поставка серверного оборудования для Акимата',
    amount: 100000000,
    currency: 'KZT',
    customerName: 'Акимат г. Алматы',
    customerBin: '990140001234',
    region: 'Алматы',
    category: 'IT и Оборудование',
    procurementMethod: 'OPEN_TENDER',
    source: 'Госзакуп',
    sourceUrl: 'https://goszakup.gov.kz/tr/101'
  });

  // -------------------------------------------------------------
  // 1️⃣ Test Urgency Score & Criticality Zone Calculation
  // -------------------------------------------------------------
  console.log('  1️⃣ Testing Urgency Score & Criticality Zone Calculations...');

  const now = Date.now();
  const dateIn12Hours = new Date(now + 12 * 60 * 60 * 1000);
  const dateIn2Days = new Date(now + 2 * 24 * 60 * 60 * 1000);
  const dateIn5Days = new Date(now + 5 * 24 * 60 * 60 * 1000);
  const dateIn10Days = new Date(now + 10 * 24 * 60 * 60 * 1000);
  const dateIn20Days = new Date(now + 20 * 24 * 60 * 60 * 1000);

  // Time urgency scores
  assert.strictEqual(DeadlineService.calculateUrgencyByTime(dateIn12Hours), 100, '≤1d must be 100');
  assert.strictEqual(DeadlineService.calculateUrgencyByTime(dateIn2Days), 80, '2-3d must be 80');
  assert.strictEqual(DeadlineService.calculateUrgencyByTime(dateIn5Days), 50, '4-7d must be 50');
  assert.strictEqual(DeadlineService.calculateUrgencyByTime(dateIn10Days), 25, '8-14d must be 25');
  assert.strictEqual(DeadlineService.calculateUrgencyByTime(dateIn20Days), 10, '>14d must be 10');
  console.log('     ✅ Time urgency scores (100, 80, 50, 25, 10) calculated correctly');

  // Criticality zones
  assert.strictEqual(DeadlineService.getCriticalityZone(dateIn12Hours), 'CRITICAL', '≤48h must be CRITICAL');
  assert.strictEqual(DeadlineService.getCriticalityZone(dateIn5Days), 'SOON', '3-7d must be SOON');
  assert.strictEqual(DeadlineService.getCriticalityZone(dateIn10Days), 'MEDIUM', '8-14d must be MEDIUM');
  assert.strictEqual(DeadlineService.getCriticalityZone(dateIn20Days), 'PLANNED', '>14d must be PLANNED');
  console.log('     ✅ Criticality zones (🔴 CRITICAL, 🟠 SOON, 🟡 MEDIUM, ⚪ PLANNED) evaluated correctly');

  // Composite Urgency Score weighting with & without winProbability
  const scoreWithWin = DeadlineService.calculateUrgencyScore(dateIn2Days, 100000000, 50000000, 80);
  // wTime=0.5 * 80 + wValue=0.3 * (2x median -> 100) + wWin=0.2 * 80 = 40 + 30 + 16 = 86
  assert.strictEqual(scoreWithWin.urgencyScore, 86, 'Urgency score with win probability must match weighted formula');
  console.log('     ✅ Composite urgency score with win probability weighted correctly (score = 86)');

  const scoreNullWin = DeadlineService.calculateUrgencyScore(dateIn2Days, 100000000, 50000000, null);
  // wTime=0.7 * 80 + wValue=0.3 * 100 = 56 + 30 = 86
  assert.strictEqual(scoreNullWin.urgencyScore, 86, 'Urgency score with null win probability must redistribute weight to time');
  assert.strictEqual(scoreNullWin.urgencyByWinProbability, null);
  console.log('     ✅ Weight redistribution when winProbability is null verified');

  // -------------------------------------------------------------
  // 2️⃣ Test Service Methods & Auto-Creation of SUBMISSION_DEADLINE
  // -------------------------------------------------------------
  console.log('\n  2️⃣ Testing Service Methods & Auto-Creation of SUBMISSION_DEADLINE...');

  const autoSub1 = await DeadlineService.autoCreateSubmissionDeadline(testTenderId, testCompanyId, dateIn5Days);
  assert.ok(autoSub1, 'Auto-created submission deadline must return record');
  assert.strictEqual(autoSub1.type, 'SUBMISSION_DEADLINE');
  assert.strictEqual(autoSub1.companyId, testCompanyId);

  // Re-calling autoCreateSubmissionDeadline must return existing without duplicates
  const autoSub2 = await DeadlineService.autoCreateSubmissionDeadline(testTenderId, testCompanyId, dateIn5Days);
  assert.strictEqual(autoSub1.id, autoSub2.id, 'Duplicate auto-creation must return existing deadline');
  console.log('     ✅ SUBMISSION_DEADLINE auto-created cleanly without duplicates');

  // Create CUSTOM deadline
  const custom1 = await DeadlineService.createDeadline({
    tenderId: testTenderId,
    companyId: testCompanyId,
    type: 'CUSTOM',
    dueAt: dateIn2Days,
    title: 'Собрать банковскую гарантию'
  });
  assert.strictEqual(custom1.type, 'CUSTOM');
  assert.strictEqual(custom1.title, 'Собрать банковскую гарантию');
  console.log('     ✅ CUSTOM deadline created successfully');

  // Fetch list & check urgency sorting
  const list = await DeadlineService.getCompanyDeadlines(testCompanyId);
  assert.strictEqual(list.length, 2, 'Must return 2 deadlines');
  assert.ok(list[0].urgencyScore >= list[1].urgencyScore, 'List must be sorted by urgencyScore DESC');
  console.log('     ✅ Deadlines returned sorted by urgencyScore DESC');

  // -------------------------------------------------------------
  // 3️⃣ Test API Routes & Tenant Isolation
  // -------------------------------------------------------------
  console.log('\n  3️⃣ Testing API Endpoints & Tenant Isolation...');

  // Unauthenticated requests
  const unauthReq = createMockReq('http://localhost/api/deadlines');
  const unauthRes = await getDeadlines(unauthReq);
  assert.strictEqual(unauthRes.status, 401, 'Unauthenticated GET /api/deadlines must return 401');
  console.log('     ✅ GET /api/deadlines returns 401 when unauthenticated');

  const unauthPostReq = createMockReq('http://localhost/api/deadlines', {
    body: { tenderId: testTenderId, dueAt: dateIn5Days.toISOString() }
  });
  const unauthPostRes = await createDeadline(unauthPostReq);
  assert.strictEqual(unauthPostRes.status, 401, 'Unauthenticated POST /api/deadlines must return 401');
  console.log('     ✅ POST /api/deadlines returns 401 when unauthenticated');

  // Access by demo-user-id with ALLOW_DEMO_AUTH=true
  process.env.ALLOW_DEMO_AUTH = 'true';
  const demoReq = createMockReq('http://localhost/api/deadlines');
  const demoRes = await getDeadlines(demoReq);
  assert.strictEqual(demoRes.status, 200, 'GET /api/deadlines with ALLOW_DEMO_AUTH=true must return 200');
  const demoData = await demoRes.json();
  assert.strictEqual(demoData.success, true);
  assert.strictEqual(demoData.deadlines.length, 2);
  console.log('     ✅ GET /api/deadlines authorized and returned company deadlines');

  // GET /api/deadlines/summary
  const summaryReq = createMockReq('http://localhost/api/deadlines/summary');
  const summaryRes = await getDeadlinesSummary(summaryReq);
  assert.strictEqual(summaryRes.status, 200);
  const summaryData = await summaryRes.json();
  assert.strictEqual(summaryData.summary.totalPending, 2);
  console.log('     ✅ GET /api/deadlines/summary returned aggregated criticality counters:', summaryData.summary);

  // PATCH /api/deadlines/[id] status update
  const patchReq = createMockReq(`http://localhost/api/deadlines/${custom1.id}`, {
    body: { status: 'COMPLETED' }
  });
  const patchRes = await updateDeadline(patchReq, { params: { id: custom1.id } });
  assert.strictEqual(patchRes.status, 200);
  const patchData = await patchRes.json();
  assert.strictEqual(patchData.deadline.status, 'COMPLETED');
  console.log('     ✅ PATCH /api/deadlines/[id] updated status to COMPLETED');

  // -------------------------------------------------------------
  // 4️⃣ Test Cron Endpoint & Telegram Notifications Security
  // -------------------------------------------------------------
  console.log('\n  4️⃣ Testing Cron Endpoint & Telegram Notifications Security...');

  // Unauthenticated cron call -> 401
  const unauthCronReq = createMockReq('http://localhost/api/cron/check-upcoming-deadlines');
  const unauthCronRes = await cronCheckDeadlines(unauthCronReq);
  assert.strictEqual(unauthCronRes.status, 401, 'Cron without X-Cron-Secret must return 401');
  console.log('     ✅ Cron endpoint returns 401 without X-Cron-Secret');

  // Authorized cron call -> 200
  const authCronReq = createMockReq('http://localhost/api/cron/check-upcoming-deadlines', {
    headers: { 'x-cron-secret': process.env.CRON_SECRET || 'tender-cron-secret-key' }
  });
  const authCronRes = await cronCheckDeadlines(authCronReq);
  assert.strictEqual(authCronRes.status, 200);
  const cronData = await authCronRes.json();
  assert.strictEqual(cronData.success, true);
  console.log('     ✅ Cron endpoint with valid X-Cron-Secret returned 200 OK');

  console.log('\n🎉 ALL DEADLINE TRACKER TESTS PASSED PERFECTLY!\n');
}

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Deadline Tracker Test Failed:', err);
    process.exit(1);
  });
