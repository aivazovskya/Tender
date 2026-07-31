const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { isClientComponent, checkFileViolations, resolveImportPath } = require('../check-client-secrets');

console.log('🧪 Running Client Secrets Guard Unit & Integration Tests...\n');

// Test 1: Unit Test isClientComponent
const tempDir = path.join(__dirname, 'temp_test_guard');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

try {
  const clientFile = path.join(tempDir, 'ClientComp.tsx');
  fs.writeFileSync(clientFile, `'use client';\nexport function ClientComp() { return <div>Test</div>; }`);
  assert.strictEqual(isClientComponent(clientFile), true, 'Should detect use client directive');

  const serverFile = path.join(tempDir, 'ServerComp.tsx');
  fs.writeFileSync(serverFile, `export function ServerComp() { return <div>Test</div>; }`);
  assert.strictEqual(isClientComponent(serverFile), false, 'Should not detect use client directive for server component');

  // Test 2: NEXT_PUBLIC_ Exemption
  const nextPublicFile = path.join(tempDir, 'NextPublic.ts');
  fs.writeFileSync(nextPublicFile, `const key = process.env.NEXT_PUBLIC_SECRET_KEY;\nconst token = process.env.NEXT_PUBLIC_TOKEN;`);
  const violations1 = checkFileViolations(nextPublicFile);
  assert.strictEqual(violations1.length, 0, 'NEXT_PUBLIC_ secrets should NOT trigger violations');

  // Test 3: Secret Detection
  const secretFile = path.join(tempDir, 'SecretFile.ts');
  fs.writeFileSync(secretFile, `const secret = process.env.DB_SECRET;\nconst token = process.env.TELEGRAM_BOT_TOKEN;`);
  const violations2 = checkFileViolations(secretFile);
  assert.strictEqual(violations2.length, 2, 'Should detect DB_SECRET and TELEGRAM_BOT_TOKEN');

  // Test 4: ci-guard-ignore Comment Bypass
  const ignoredFile = path.join(tempDir, 'IgnoredSecret.ts');
  fs.writeFileSync(ignoredFile, `// ci-guard-ignore: intentional client side mock\nconst secret = process.env.MOCK_SECRET;`);
  const violations3 = checkFileViolations(ignoredFile);
  assert.strictEqual(violations3.length, 0, 'Line with ci-guard-ignore comment should be ignored');

  // Test 5: Integration Test on Current Codebase (should pass with exit code 0)
  console.log('▶ Testing current codebase with check-client-secrets.js...');
  const scriptPath = path.join(__dirname, '../check-client-secrets.js');
  const outputClean = execSync(`node "${scriptPath}"`, { encoding: 'utf8' });
  assert(outputClean.includes('[CI Guard Passed]'), 'Current codebase should pass guard check');
  console.log('✔ Clean codebase verification passed!');

  // Test 6: Regression Test on Bug #25 (Simulated leak in client component)
  console.log('▶ Testing regression simulation (Bug #25 leak)...');
  const mockClientComponent = path.join(process.cwd(), 'src', 'components', '__TempMockLeakyComponent.tsx');
  try {
    fs.writeFileSync(
      mockClientComponent,
      `'use client';\nimport { TelegramBotService } from '@/lib/services/telegram.service';\nexport function Temp() { TelegramBotService.sendNotification({} as any); return null; }`
    );

    let failedAsExpected = false;
    try {
      execSync(`node "${scriptPath}"`, { encoding: 'utf8', stdio: 'pipe' });
    } catch (err) {
      failedAsExpected = true;
      assert.strictEqual(err.status, 1, 'Script should exit with code 1 on secret leak');
      assert(err.stdout.includes('TELEGRAM_BOT_TOKEN') || err.stderr.includes('TELEGRAM_BOT_TOKEN'), 'Output should mention TELEGRAM_BOT_TOKEN leak');
    }

    assert.strictEqual(failedAsExpected, true, 'Guard should fail when client component imports leaky service');
    console.log('✔ Regression test for Bug #25 passed (correctly caught leak and returned exit code 1)!');
  } finally {
    if (fs.existsSync(mockClientComponent)) {
      fs.unlinkSync(mockClientComponent);
    }
  }

  console.log('\n🎉 All Client Secrets Guard tests passed successfully!');
} finally {
  // Cleanup temp dir
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}
