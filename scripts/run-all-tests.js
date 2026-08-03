const { execSync } = require('child_process');
const path = require('path');

const tests = [
  'scripts/tests/transforms.test.js',
  'scripts/tests/kaspi-webhook.test.js',
  'scripts/tests/ssrf.test.js',
  'scripts/tests/ingestion-idempotency.test.js',
  'scripts/tests/ingestion-bugs.test.js',
  'scripts/tests/source-label.test.js',
  'scripts/tests/telegram-privacy.test.js',
  'scripts/tests/kaspi-security.test.js',
  'scripts/tests/bot-payload.test.js',
  'scripts/tests/kanban-sync.test.js',
  'scripts/tests/rbac-security.test.js',
  'scripts/tests/bot-spec-command.test.js',
  'scripts/tests/document-extraction.test.js',
  'scripts/tests/ingestion-unification.test.js',
  'scripts/tests/ingestion-bugs-v5.test.js',
  'scripts/tests/product-features.test.js',
  'scripts/tests/client-secrets-guard.test.js',
  'scripts/tests/i18n.test.js',
  'scripts/tests/kanban-card-details.test.js',
  'scripts/tests/adapter-registry.test.js',
  'scripts/tests/check-matches.test.js',
  'scripts/tests/export-reports.test.js',
  'scripts/tests/public-api-keys.test.js',
  'scripts/tests/reputation-check.test.js',
  'scripts/tests/competition-estimate.test.js',
  'scripts/tests/tender-calculation.test.js',
  'scripts/tests/tender-calculation-v1-1.test.js',
  'scripts/tests/roadmap-phase-1.test.js'
];

console.log('🚀 Running TenderAI Automated Test Suite (npm test)...\n');

let passedCount = 0;
for (const testFile of tests) {
  try {
    const fullPath = path.join(process.cwd(), testFile);
    console.log(`▶ Executing ${testFile}...`);
    execSync(`node "${fullPath}"`, { stdio: 'inherit' });
    passedCount++;
    console.log('');
  } catch (err) {
    console.error(`💥 Test failed in ${testFile}`);
    process.exit(1);
  }
}

console.log(`🎉 All ${passedCount}/${tests.length} test suites executed successfully!`);
