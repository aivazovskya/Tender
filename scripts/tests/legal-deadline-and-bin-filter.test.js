require('tsx/cjs');
const assert = require('assert');
const { addWorkingDays, DeadlineService } = require('../../src/lib/services/deadline.service');
const { CompetitionService } = require('../../src/lib/services/competition.service');

async function runTests() {
  console.log('🧪 [Test Suite] Testing Legal Working Days & Organization BIN Filter Fixes...\n');

  // 1. Test addWorkingDays helper
  console.log('▶ 1. Testing addWorkingDays Weekend-Skipping Calculation...');
  // Friday Aug 14, 2026
  const friday = new Date('2026-08-14T10:00:00Z');
  const result3Days = addWorkingDays(friday, 3);
  
  // Sat 15 (skip), Sun 16 (skip), Mon 17 (1), Tue 18 (2), Wed 19 (3)
  assert.strictEqual(result3Days.getUTCDay(), 3, '3 working days from Friday should land on Wednesday (UTCDay 3)');
  assert.strictEqual(result3Days.getUTCDate(), 19, '3 working days from Aug 14 should land on Aug 19');
  console.log('  ✅ addWorkingDays correctly skips weekends (Aug 14 + 3 working days = Aug 19)');

  // Monday Aug 17, 2026 + 1 working day -> Tuesday Aug 18
  const monday = new Date('2026-08-17T10:00:00Z');
  const result1Day = addWorkingDays(monday, 1);
  assert.strictEqual(result1Day.getUTCDate(), 18, '1 working day from Aug 17 should land on Aug 18');
  console.log('  ✅ addWorkingDays correctly calculates consecutive weekday addition');

  // 2. Test autoCreateAppealDeadline default
  console.log('\n▶ 2. Testing autoCreateAppealDeadline (Default 3 Working Days)...');
  const futureResultDate = new Date();
  futureResultDate.setDate(futureResultDate.getDate() + 1); // tomorrow

  process.env.AUTH_STORE_MODE = 'memory';
  const appealRecord = await DeadlineService.autoCreateAppealDeadline('tender-legal-1', 'comp-1', futureResultDate);
  assert(appealRecord, 'Appeal deadline should be created for future result date');
  
  const expectedDueAt = addWorkingDays(futureResultDate, 3);
  assert.strictEqual(appealRecord.dueAt.getTime(), expectedDueAt.getTime(), 'Appeal deadline dueAt must match 3 working days from result date');
  console.log('  ✅ autoCreateAppealDeadline uses default 3 working days statutory calculation');

  // 3. Test CompetitionService.getUserCategoryDeals BIN filter logic
  console.log('\n▶ 3. Testing CompetitionService.getUserCategoryDeals BIN Filter (Individual & Organization)...');
  
  // Test fallback/empty state when no parameters passed
  const emptyDeals = await CompetitionService['getUserCategoryDeals'](undefined, undefined, 'Тест');
  assert.strictEqual(emptyDeals.total, 0, 'No userId or bin passed returns 0 deals');

  console.log('  ✅ getUserCategoryDeals handles empty input parameters gracefully');
  console.log('\n🎉 Legal Working Days & Organization BIN Filter Test Suite completed successfully!\n');
}

runTests().catch(err => {
  console.error('💥 Test suite failed:', err);
  process.exit(1);
});
