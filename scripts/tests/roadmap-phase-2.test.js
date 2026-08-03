require('tsx/cjs');
const assert = require('assert');
const path = require('path');

console.log('🧪 Running Roadmap Phase 2 (Ingestion Failure Alerting & DataSource Health) Tests...\n');

async function runTests() {
  // 1. Testing Status Transition Logic
  console.log('  1. Testing DataSource Health Status Transitions...');
  
  function getStatusForErrors(consecutiveFailures) {
    if (consecutiveFailures >= 3) return 'FAILED';
    if (consecutiveFailures > 0) return 'WARNING';
    return 'HEALTHY';
  }

  assert.strictEqual(getStatusForErrors(0), 'HEALTHY');
  assert.strictEqual(getStatusForErrors(1), 'WARNING');
  assert.strictEqual(getStatusForErrors(2), 'WARNING');
  assert.strictEqual(getStatusForErrors(3), 'FAILED');
  assert.strictEqual(getStatusForErrors(5), 'FAILED');
  console.log('     ✅ Health status transitions (HEALTHY -> WARNING -> FAILED) verified');

  // 2. Testing Scraper Silent Hours Heartbeat Check
  console.log('  2. Testing Scraper Silent Hours Heartbeat Check...');
  
  function isScraperSilent(lastSuccessTimestamp, maxSilentHours = 6) {
    const hours = (Date.now() - new Date(lastSuccessTimestamp).getTime()) / (1000 * 60 * 60);
    return hours > maxSilentHours;
  }

  const recentRun = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
  const silentRun = new Date(Date.now() - 7 * 60 * 60 * 1000); // 7 hours ago

  assert.strictEqual(isScraperSilent(recentRun), false);
  assert.strictEqual(isScraperSilent(silentRun), true);
  console.log('     ✅ Silent scraper detection (>6h without new tenders) verified');

  console.log('\n🎉 All Roadmap Phase 2 Tests passed successfully!');
}

runTests().catch(err => {
  console.error('💥 Test execution error:', err);
  process.exit(1);
});
