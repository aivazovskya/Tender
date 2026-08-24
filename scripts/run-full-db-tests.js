const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const testsDir = path.join(__dirname, 'tests');
const files = fs.readdirSync(testsDir).filter(f => f.endsWith('.test.js')).sort();

console.log(`🚀 Found ${files.length} test files to execute against real Postgres & Redis...\n`);

const results = [];

for (let i = 0; i < files.length; i++) {
  const file = files[i];
  const fullPath = path.join(testsDir, file);
  console.log(`================================================================================`);
  console.log(`[${i + 1}/${files.length}] Running: ${file}`);
  console.log(`================================================================================`);

  const startTime = Date.now();
  const proc = spawnSync(process.execPath, [fullPath], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env },
    encoding: 'utf8',
    timeout: 45000
  });
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  const stdout = proc.stdout || '';
  const stderr = proc.stderr || '';
  const status = proc.status === 0 ? 'PASS' : 'FAIL';

  if (stdout) console.log(stdout.trim());
  if (stderr) console.error(stderr.trim());

  if (proc.status === 0) {
    console.log(`\n>>> RESULT: ✅ PASS (${duration}s)\n`);
  } else {
    console.log(`\n>>> RESULT: ❌ FAIL (Exit code: ${proc.status}, Signal: ${proc.signal}, ${duration}s)\n`);
  }

  results.push({
    file,
    status,
    exitCode: proc.status,
    signal: proc.signal,
    duration,
    stdout,
    stderr
  });
}

console.log(`\n================================================================================`);
console.log(`FINAL SUMMARY`);
console.log(`================================================================================`);
const passed = results.filter(r => r.status === 'PASS').length;
const failed = results.filter(r => r.status === 'FAIL').length;
console.log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed}\n`);

results.forEach((r, idx) => {
  const icon = r.status === 'PASS' ? '✅' : '❌';
  console.log(`${(idx + 1).toString().padStart(2, ' ')}. ${icon} [${r.status}] ${r.file} (${r.duration}s)`);
});

fs.writeFileSync(
  path.join(__dirname, 'test-run-results.json'),
  JSON.stringify(results, null, 2),
  'utf8'
);
