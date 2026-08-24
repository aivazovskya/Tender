require('tsx/cjs');
const assert = require('assert');
const { DeadlineService, addWorkingDays } = require('../../src/lib/services/deadline.service');
const { prisma } = require('../../src/lib/prisma');
const { GET: checkSubmittedResultsGET } = require('../../src/app/api/cron/check-submitted-tender-results/route');
process.env.AUTH_STORE_MODE = 'memory';

console.log('🧪 Starting Appeal Deadline Reminders Test Suite...\n');

async function testAutoCreateAppealDeadlineUnit() {
  console.log('1️⃣ Testing DeadlineService.autoCreateAppealDeadline unit logic...');
  const tenderId = 't-appeal-unit-1';
  const companyId = 'c-appeal-unit-1';

  // 1. Future resultDate -> creates APPEAL_DEADLINE
  const resultDate = new Date();
  const deadline = await DeadlineService.autoCreateAppealDeadline(tenderId, companyId, resultDate, 10);

  assert.ok(deadline, 'Deadline should be created for future dueAt');
  assert.strictEqual(deadline.tenderId, tenderId);
  assert.strictEqual(deadline.companyId, companyId);
  assert.strictEqual(deadline.type, 'APPEAL_DEADLINE');
  assert.strictEqual(deadline.title, 'Срок подачи жалобы на результаты закупки');

  const expectedDueAt = addWorkingDays(resultDate, 10);
  assert.strictEqual(Math.floor(new Date(deadline.dueAt).getTime() / 1000), Math.floor(expectedDueAt.getTime() / 1000));
  console.log('   ✅ autoCreateAppealDeadline correctly computes dueAt with configured APPEAL_WINDOW_DAYS');

  // 2. Idempotency test -> returns existing deadline
  const duplicate = await DeadlineService.autoCreateAppealDeadline(tenderId, companyId, resultDate, 10);
  assert.strictEqual(duplicate.id, deadline.id, 'Repeated call must return same deadline record');
  console.log('   ✅ autoCreateAppealDeadline is idempotent (no duplicate deadlines created)');

  // 3. Past resultDate where dueAt is in the past -> returns null
  const oldDate = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const expiredDeadline = await DeadlineService.autoCreateAppealDeadline('t-old', companyId, oldDate, 10);
  assert.strictEqual(expiredDeadline, null, 'Should return null for already expired dueAt');
  console.log('   ✅ autoCreateAppealDeadline safely skips creating already expired deadlines');
}

async function testSubmittedTenderResultsIntegration() {
  console.log('\n2️⃣ Testing Cron /api/cron/check-submitted-tender-results integration...');

  const origFindMany = prisma.kanbanCard.findMany;
  const origUpdate = prisma.kanbanCard.update;
  const origFindFirstCompany = prisma.companyProfile.findFirst;

  try {
    const testCardLost = {
      id: 'card-lost-1',
      userId: 'demo-user-id',
      organizationId: null,
      tenderId: 'tender-lost-1',
      tender: {
        id: 'tender-lost-1',
        externalId: 'test-lost-tender',
        title: 'Тендер для проверки обжалования',
        customerName: 'Заказчик Астана'
      }
    };

    prisma.kanbanCard.findMany = async () => [testCardLost];
    prisma.kanbanCard.update = async () => testCardLost;

    process.env.CRON_SECRET = 'valid-test-secret-123';
    process.env.AUTH_STORE_MODE = 'memory';

    const req = {
      headers: new Map([['x-cron-secret', 'valid-test-secret-123']]),
      url: 'http://localhost/api/cron/check-submitted-tender-results'
    };
    req.headers.get = (name) => name.toLowerCase() === 'x-cron-secret' ? 'valid-test-secret-123' : null;

    const res = await checkSubmittedResultsGET(req);
    const data = await res.json();

    assert.strictEqual(data.success, true);
    assert.strictEqual(data.lostCount, 1, 'Card must be marked as lost');

    // Verify APPEAL_DEADLINE created
    const companyDeadlines = await DeadlineService.getCompanyDeadlines('demo-company-profile-id', { type: 'APPEAL_DEADLINE' });
    assert.ok(companyDeadlines.length > 0, 'APPEAL_DEADLINE must be created for LOST tender');
    assert.strictEqual(companyDeadlines[0].tenderId, 'tender-lost-1');
    assert.strictEqual(companyDeadlines[0].title, 'Срок подачи жалобы на результаты закупки');
    console.log('   ✅ Cron check-submitted-tender-results automatically creates APPEAL_DEADLINE when card is marked LOST');
  } finally {
    prisma.kanbanCard.findMany = origFindMany;
    prisma.kanbanCard.update = origUpdate;
    prisma.companyProfile.findFirst = origFindFirstCompany;
  }
}

async function runAll() {
  try {
    await testAutoCreateAppealDeadlineUnit();
    await testSubmittedTenderResultsIntegration();
    console.log('\n🎉 Appeal Deadline Reminders Test Suite completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Test Failure:', err);
    process.exit(1);
  }
}

runAll();
