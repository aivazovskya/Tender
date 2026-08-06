require('tsx/cjs');
const assert = require('assert');

console.log('🧪 Starting Deadline Tracker Audit Fixes Verification Test Suite...\n');

async function testCronSecretProtection() {
  console.log('1️⃣ Testing Defect 3: CRON_SECRET Protection in /api/cron/check-upcoming-deadlines...');
  
  const { GET: checkDeadlinesGET } = require('../../src/app/api/cron/check-upcoming-deadlines/route');
  const origSecret = process.env.CRON_SECRET;

  // Test 1.1: Missing CRON_SECRET returns 500 Server misconfiguration
  delete process.env.CRON_SECRET;
  const mockReqNoSecret = {
    headers: new Map(),
    url: 'http://localhost/api/cron/check-upcoming-deadlines'
  };
  mockReqNoSecret.headers.get = (name) => null;

  const res500 = await checkDeadlinesGET(mockReqNoSecret);
  assert.strictEqual(res500.status, 500, 'Missing CRON_SECRET must yield status 500');
  const data500 = await res500.json();
  assert.strictEqual(data500.message, 'Server misconfiguration', 'Missing CRON_SECRET must yield Server misconfiguration');
  console.log('   ✅ Missing CRON_SECRET correctly returns 500 Server misconfiguration');

  // Test 1.2: Invalid CRON_SECRET header returns 401 Unauthorized
  process.env.CRON_SECRET = 'valid-secret-123';
  const mockReqInvalid = {
    headers: new Map([['x-cron-secret', 'wrong-secret']]),
    url: 'http://localhost/api/cron/check-upcoming-deadlines'
  };
  mockReqInvalid.headers.get = (name) => name.toLowerCase() === 'x-cron-secret' ? 'wrong-secret' : null;

  const res401 = await checkDeadlinesGET(mockReqInvalid);
  assert.strictEqual(res401.status, 401, 'Invalid CRON_SECRET must yield status 401');
  console.log('   ✅ Invalid X-Cron-Secret header correctly returns 401 Unauthorized');

  // Restore env
  process.env.CRON_SECRET = origSecret;
}

async function testVercelCronConfig() {
  console.log('\n2️⃣ Testing Defect 2: vercel.json Cron Registration...');
  const fs = require('fs');
  const path = require('path');
  const vercelJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'vercel.json'), 'utf8'));

  const deadlineCron = vercelJson.crons.find(c => c.path === '/api/cron/check-upcoming-deadlines');
  assert.ok(deadlineCron, 'vercel.json must contain /api/cron/check-upcoming-deadlines entry');
  assert.strictEqual(deadlineCron.schedule, '0 7,19 * * *', 'Schedule must be set to "0 7,19 * * *"');
  console.log('   ✅ vercel.json contains /api/cron/check-upcoming-deadlines with schedule "0 7,19 * * *"');
}

async function testDefect1IngestionAndKanban() {
  console.log('\n3️⃣ Testing Defect 1: Removal of auto-deadlines from ingestion & move to Kanban Card creation...');
  const fs = require('fs');
  const path = require('path');

  const ingestionCode = fs.readFileSync(path.join(process.cwd(), 'src/lib/services/ingestion-processor.service.ts'), 'utf8');
  assert.strictEqual(
    ingestionCode.includes('autoCreateSubmissionDeadline'),
    false,
    'ingestion-processor.service.ts MUST NOT contain autoCreateSubmissionDeadline'
  );
  assert.strictEqual(
    ingestionCode.includes('DeadlineService'),
    false,
    'ingestion-processor.service.ts MUST NOT import or reference DeadlineService'
  );
  console.log('   ✅ ingestion-processor.service.ts correctly has NO auto-deadline creation code');

  const kanbanRouteCode = fs.readFileSync(path.join(process.cwd(), 'src/app/api/kanban/route.ts'), 'utf8');
  assert.ok(
    kanbanRouteCode.includes('DeadlineService.autoCreateSubmissionDeadline'),
    'POST /api/kanban MUST call DeadlineService.autoCreateSubmissionDeadline'
  );
  assert.ok(
    kanbanRouteCode.includes('resolveOwnCompanyProfile(auth.userId)'),
    'POST /api/kanban MUST resolve company profile via resolveOwnCompanyProfile(auth.userId)'
  );
  console.log('   ✅ POST /api/kanban correctly calls autoCreateSubmissionDeadline with resolveOwnCompanyProfile(auth.userId)');

  const migrationCode = fs.readFileSync(path.join(process.cwd(), 'scripts/migrations/purge-unlinked-submission-deadlines.ts'), 'utf8');
  assert.ok(
    migrationCode.includes('purgeUnlinkedSubmissionDeadlines'),
    'Migration script purge-unlinked-submission-deadlines.ts must exist and declare purgeUnlinkedSubmissionDeadlines'
  );
  console.log('   ✅ Migration script scripts/migrations/purge-unlinked-submission-deadlines.ts is present');
}

async function runAll() {
  try {
    await testCronSecretProtection();
    await testVercelCronConfig();
    await testDefect1IngestionAndKanban();
    console.log('\n🎉 All Deadline Audit Fixes tests passed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Test Failure:', err);
    process.exit(1);
  }
}

runAll();
