const { execSync } = require('child_process');
const path = require('path');

const tests = [
  'scripts/tests/transforms.test.js',
  'scripts/tests/kaspi-webhook.test.js',
  'scripts/tests/ssrf.test.js',
  'scripts/tests/ingestion-idempotency.test.js',
  'scripts/tests/ingestion-bugs.test.js'
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
