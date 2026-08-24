const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const testsDir = path.join(process.cwd(), 'scripts/tests');
const tests = fs.readdirSync(testsDir)
  .filter(f => f.endsWith('.test.js'))
  .sort()
  .map(f => `scripts/tests/${f}`);

console.log(`🚀 Running TenderAI Automated Test Suite (npm test) across ${tests.length} suites...\n`);

let passedCount = 0;
const failed = [];

for (const testFile of tests) {
  try {
    const fullPath = path.join(process.cwd(), testFile);
    console.log(`▶ Executing ${testFile}...`);
    execSync(`node "${fullPath}"`, { stdio: 'inherit' });
    passedCount++;
    console.log('');
  } catch (err) {
    console.error(`💥 Test failed in ${testFile}\n`);
    failed.push(testFile);
  }
}

console.log(`==================================================`);
console.log(`📊 Test Execution Summary:`);
console.log(`   ✅ Passed: ${passedCount}/${tests.length}`);
if (failed.length > 0) {
  console.log(`   ❌ Failed: ${failed.length}/${tests.length}`);
  console.log(`   🚨 Failing suites:`);
  failed.forEach(f => console.log(`      - ${f}`));
  console.log(`==================================================\n`);
  process.exit(1);
} else {
  console.log(`   🎉 All ${passedCount}/${tests.length} test suites executed successfully!`);
  console.log(`==================================================\n`);
}
