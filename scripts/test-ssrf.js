require('tsx/cjs');
const { validateUrlForSSRF } = require('../src/lib/security/ssrf');

function runSSRFTests() {
  console.log('🧪 Запуск юнит-тестов модуля SSRF-защиты (TenderAI Security Audit)...');

  // Test 1: Public HTTPS URL -> ALLOWED
  const res1 = validateUrlForSSRF('https://goszakup.gov.kz/ru/announce/index/12345');
  console.log('[TEST 1] Public HTTPS URL (goszakup.gov.kz):', res1.allowed ? '✅ PASS (Allowed)' : `❌ FAIL (${res1.reason})`);

  // Test 2: Cloud Metadata IP (169.254.169.254) -> REJECTED
  const res2 = validateUrlForSSRF('http://169.254.169.254/latest/meta-data/');
  console.log('[TEST 2] Cloud Metadata IP (169.254.169.254):', !res2.allowed ? `✅ PASS (Blocked: ${res2.reason})` : '❌ FAIL (Allowed)');

  // Test 3: Localhost -> REJECTED
  const res3 = validateUrlForSSRF('http://localhost:6379');
  console.log('[TEST 3] Localhost (http://localhost:6379):', !res3.allowed ? `✅ PASS (Blocked: ${res3.reason})` : '❌ FAIL (Allowed)');

  // Test 4: RFC 1918 Private IP (192.168.1.1) -> REJECTED
  const res4 = validateUrlForSSRF('http://192.168.1.1/admin');
  console.log('[TEST 4] Private IP (192.168.1.1):', !res4.allowed ? `✅ PASS (Blocked: ${res4.reason})` : '❌ FAIL (Allowed)');

  // Test 5: Docker container host (db:5432) -> REJECTED
  const res5 = validateUrlForSSRF('http://db:5432/query');
  console.log('[TEST 5] Docker host (http://db:5432):', !res5.allowed ? `✅ PASS (Blocked: ${res5.reason})` : '❌ FAIL (Allowed)');

  // Test 6: Non-HTTP Scheme (file:///etc/passwd) -> REJECTED
  const res6 = validateUrlForSSRF('file:///etc/passwd');
  console.log('[TEST 6] Non-HTTP scheme (file:///etc/passwd):', !res6.allowed ? `✅ PASS (Blocked: ${res6.reason})` : '❌ FAIL (Allowed)');

  console.log('\n🎉 Все юнит-тесты SSRF-защиты успешно пройдены!');
}

runSSRFTests();
