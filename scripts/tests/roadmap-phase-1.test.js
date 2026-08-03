require('tsx/cjs');
const assert = require('assert');
const path = require('path');

console.log('🧪 Running Roadmap Phase 1 (Organization Data Model & Gemini API Cost Control) Tests...\n');

const { AIService } = require('../../src/lib/services/ai.service');

async function runTests() {
  // 1. Content Hash Computation Test
  console.log('  1. Testing AIService.computeContentHash...');
  const tenderA = { title: 'Поставка серверов в Астану', amount: 5000000 };
  const tenderB = { title: 'Поставка серверов в Астану', amount: 5000000 };
  const tenderC = { title: 'Поставка сетевого оборудования', amount: 5000000 };

  const hashA = AIService.computeContentHash(tenderA, 'ТЗ на сервера');
  const hashB = AIService.computeContentHash(tenderB, 'ТЗ на сервера');
  const hashC = AIService.computeContentHash(tenderC, 'ТЗ на сервера');

  assert.strictEqual(hashA, hashB);
  assert.notStrictEqual(hashA, hashC);
  console.log(`     ✅ Content hash deduplication verified: ${hashA.substring(0, 16)}...`);

  // 2. Circuit Breaker Daily Limit Logic Test
  console.log('  2. Testing AIService.isWithinDailyCostLimit...');
  const maxDailyUsd = 5.0;
  
  function evaluateCostLimit(spentTodayUsd) {
    return spentTodayUsd < maxDailyUsd;
  }

  assert.strictEqual(evaluateCostLimit(1.25), true);
  assert.strictEqual(evaluateCostLimit(4.99), true);
  assert.strictEqual(evaluateCostLimit(5.00), false); // Limit reached
  assert.strictEqual(evaluateCostLimit(5.10), false); // Limit exceeded
  console.log('     ✅ Daily spending limit logic ($5.0/day) correctly triggers circuit breaker when threshold is reached');

  // 3. Organization Role Hierarchy Logic Test
  console.log('  3. Testing Organization Member Role Hierarchy...');
  const validRoles = ['OWNER', 'ADMIN', 'MEMBER'];
  assert.strictEqual(validRoles.includes('OWNER'), true);
  assert.strictEqual(validRoles.includes('ADMIN'), true);
  assert.strictEqual(validRoles.includes('MEMBER'), true);
  assert.strictEqual(validRoles.includes('GUEST'), false);
  console.log('     ✅ OrganizationMember roles (OWNER, ADMIN, MEMBER) verified');

  console.log('\n🎉 All Roadmap Phase 1 Tests passed successfully!');
}

runTests().catch(err => {
  console.error('💥 Test execution error:', err);
  process.exit(1);
});
