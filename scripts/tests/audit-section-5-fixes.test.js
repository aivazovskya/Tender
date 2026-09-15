require('tsx/cjs');
const assert = require('assert');
const { middleware } = require('../../src/middleware');
const { parseAlternateIp, validateUrlForSSRF } = require('../../src/lib/security/ssrf');
const { TelegrafBotService } = require('../../src/lib/telegram/bot.service');
const { GET: documentsGET } = require('../../src/app/api/tenders/[id]/documents/route');
const { POST: createOrderPOST } = require('../../src/app/api/billing/kaspi/create-order/route');
const { GET: supplierComparisonGET, POST: supplierComparisonPOST } = require('../../src/app/api/tenders/[id]/supplier-comparison/route');
const { GET: supplierExcelGET } = require('../../src/app/api/tenders/[id]/supplier-comparison/export-excel/route');
const { PATCH: patchSecurityInstrument } = require('../../src/app/api/security-instruments/[id]/route');

console.log('🧪 Starting Audit Section 5 Fixes Verification Test Suite...\n');

// 1. Middleware Webhook Bypass (Finding 5.1-1)
console.log('1️⃣ Testing Middleware Webhook Bypass (Finding 5.1-1)...');
function createMockRequest(url, headers = {}) {
  const parsed = new URL(url);
  return {
    url,
    nextUrl: { pathname: parsed.pathname },
    headers: {
      get: (name) => headers[name.toLowerCase()] || null
    },
    cookies: {
      get: () => null
    }
  };
}

const kaspiWebhookReq = createMockRequest('https://tender.example.kz/api/billing/kaspi/webhook');
const kaspiRes = middleware(kaspiWebhookReq);
assert.strictEqual(kaspiRes.status, 200, 'Middleware must allow /api/billing/kaspi/webhook without auth header');

const tgWebhookReq = createMockRequest('https://tender.example.kz/api/telegram/webhook');
const tgRes = middleware(tgWebhookReq);
assert.strictEqual(tgRes.status, 200, 'Middleware must allow /api/telegram/webhook without auth header');
console.log('   ✅ Kaspi Pay and Telegram webhooks pass through middleware cleanly!');

// 2. SSRF Alternate IP Notation Parsing & Blocking (Finding 5.4-13)
console.log('\n2️⃣ Testing SSRF Alternate IP Notation (Finding 5.4-13)...');
assert.strictEqual(parseAlternateIp('2130706433'), '127.0.0.1', 'Decimal 2130706433 must resolve to 127.0.0.1');
assert.strictEqual(parseAlternateIp('0x7f000001'), '127.0.0.1', 'Hex 0x7f000001 must resolve to 127.0.0.1');
assert.strictEqual(parseAlternateIp('0177.0.0.1'), '127.0.0.1', 'Octal 0177.0.0.1 must resolve to 127.0.0.1');

const ssrfDecimal = validateUrlForSSRF('http://2130706433:8080/admin');
assert.strictEqual(ssrfDecimal.allowed, false, 'Decimal integer localhost must be blocked');

const ssrfHex = validateUrlForSSRF('http://0x7f000001/status');
assert.strictEqual(ssrfHex.allowed, false, 'Hex representation localhost must be blocked');
console.log('   ✅ SSRF guard detects and blocks decimal, hex, and octal IP representations!');

// 3. Telegram Deep-Link Replay Protection (Finding 5.3-12)
console.log('\n3️⃣ Testing Telegram Deep-Link Replay Protection (Finding 5.3-12)...');
const testUser = 'user-replay-test-123';
const signedToken = TelegrafBotService.generateDeepLinkToken(testUser);
const firstVerify = TelegrafBotService.verifyDeepLinkToken(signedToken);
assert.strictEqual(firstVerify, testUser, 'First token verification must succeed');

const secondVerify = TelegrafBotService.verifyDeepLinkToken(signedToken);
assert.strictEqual(secondVerify, null, 'Second token verification must fail due to replay protection');
console.log('   ✅ Deep-link token consumed on first use and blocked on replay!');

// 4. Create-Order Auth Enforcement (Finding 5.3-9)
console.log('\n4️⃣ Testing Create-Order Auth Enforcement (Finding 5.3-9)...');
async function testCreateOrderAuth() {
  const unauthReq = {
    cookies: { get: () => null },
    headers: { get: () => null },
    json: async () => ({ tariffId: 'PRO' })
  };
  const res = await createOrderPOST(unauthReq);
  assert.strictEqual(res.status, 401, 'Unauthenticated create-order must return 401');
  console.log('   ✅ POST /api/billing/kaspi/create-order rejected with 401 when unauthenticated');
}

// 5. Tender Documents Tenant Isolation (Finding 5.2-5)
console.log('\n5️⃣ Testing Tender Documents Auth & Tenant Isolation (Finding 5.2-5)...');
async function testDocumentsAuth() {
  const unauthReq = {
    cookies: { get: () => null },
    headers: { get: () => null }
  };
  const res = await documentsGET(unauthReq, { params: { id: 'tender-1' } });
  assert.strictEqual(res.status, 401, 'Unauthenticated documents request must return 401');
  console.log('   ✅ GET /api/tenders/[id]/documents rejected with 401 when unauthenticated');
}

// 6. Supplier Comparison Auth Enforcement (Finding 5.2-6)
console.log('\n6️⃣ Testing Supplier Comparison Auth Enforcement (Finding 5.2-6)...');
async function testSupplierComparisonAuth() {
  const unauthReq = {
    cookies: { get: () => null },
    headers: { get: () => null }
  };
  const resGET = await supplierComparisonGET(unauthReq, { params: { id: 'tender-1' } });
  assert.strictEqual(resGET.status, 401, 'Unauthenticated supplier-comparison GET must return 401');

  const resPOST = await supplierComparisonPOST(unauthReq, { params: { id: 'tender-1' } });
  assert.strictEqual(resPOST.status, 401, 'Unauthenticated supplier-comparison POST must return 401');

  const resExcel = await supplierExcelGET(unauthReq, { params: { id: 'tender-1' } });
  assert.strictEqual(resExcel.status, 401, 'Unauthenticated supplier-comparison Excel export must return 401');
  console.log('   ✅ Supplier comparison endpoints require authentication (401)');
}

async function main() {
  await testCreateOrderAuth();
  await testDocumentsAuth();
  await testSupplierComparisonAuth();
  console.log('\n🎉 ALL AUDIT SECTION 5 FIXES TESTS PASSED SUCCESSFULLY!\n');
}

main().catch(err => {
  console.error('💥 Audit tests failed:', err);
  process.exit(1);
});
