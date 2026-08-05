require('tsx/cjs');
const assert = require('assert');

const { PATCH: patchRequirementItem, DELETE: deleteRequirementItem } = require('../../src/app/api/tenders/[id]/requirements/[itemId]/route');
const { PATCH: patchSecurityInstrument } = require('../../src/app/api/security-instruments/[id]/route');
const { POST: askTender } = require('../../src/app/api/tenders/ask/route');
const { GET: getMetrics } = require('../../src/app/api/admin/metrics/route');
const { POST: registerHandler } = require('../../src/app/api/auth/register/route');
const { validateApiAuth } = require('../../src/lib/security/auth');

console.log('🧪 Starting Auth Audit Critical Fixes Test Suite...\n');

function createMockReq(urlStr, options = {}) {
  const headers = options.headers || {};
  const cookies = options.cookies || {};
  return {
    url: urlStr,
    headers: {
      get: (key) => headers[key.toLowerCase()] || headers[key] || null
    },
    cookies: {
      get: (key) => (cookies[key] !== undefined ? { value: cookies[key] } : undefined)
    },
    json: async () => options.body || {}
  };
}

async function runTests() {
  const origEnv = process.env.NODE_ENV;
  const origAllowDemo = process.env.ALLOW_DEMO_AUTH;

  try {
    // -------------------------------------------------------------
    // 1️⃣ Test Finding 1: Unawaited validateApiAuth fix in real route handlers
    // -------------------------------------------------------------
    console.log('  1️⃣ Testing Finding 1 (Unawaited validateApiAuth fix in real route handlers)...');

    process.env.NODE_ENV = 'production';
    delete process.env.ALLOW_DEMO_AUTH;

    // Unauthenticated request to tenders/ask route
    const reqAsk = createMockReq('http://localhost/api/tenders/ask', { body: { tenderId: 't-1', question: 'test' } });
    const resAsk = await askTender(reqAsk);
    assert.strictEqual(resAsk.status, 401, 'tenders/ask route must return 401 when unauthenticated');
    console.log('     ✅ POST /api/tenders/ask returned 401 when unauthenticated');

    // Unauthenticated request to requirements item route (PATCH)
    const reqItemPatch = createMockReq('http://localhost/api/tenders/t-1/requirements/item-1', { body: { isCompleted: true } });
    const resItemPatch = await patchRequirementItem(reqItemPatch, { params: { id: 't-1', itemId: 'item-1' } });
    assert.strictEqual(resItemPatch.status, 401, 'requirements/[itemId] PATCH route must return 401 when unauthenticated');
    console.log('     ✅ PATCH /api/tenders/[id]/requirements/[itemId] returned 401 when unauthenticated');

    // Unauthenticated request to requirements item route (DELETE)
    const reqItemDelete = createMockReq('http://localhost/api/tenders/t-1/requirements/item-1');
    const resItemDelete = await deleteRequirementItem(reqItemDelete, { params: { id: 't-1', itemId: 'item-1' } });
    assert.strictEqual(resItemDelete.status, 401, 'requirements/[itemId] DELETE route must return 401 when unauthenticated');
    console.log('     ✅ DELETE /api/tenders/[id]/requirements/[itemId] returned 401 when unauthenticated');

    // Unauthenticated request to security instruments [id] PATCH route
    const reqSec = createMockReq('http://localhost/api/security-instruments/sec-1');
    const resSec = await patchSecurityInstrument(reqSec, { params: { id: 'sec-1' } });
    assert.strictEqual(resSec.status, 401, 'security-instruments/[id] PATCH route must return 401 when unauthenticated');
    console.log('     ✅ PATCH /api/security-instruments/[id] returned 401 when unauthenticated');

    // Unauthenticated request to admin metrics GET route
    const reqMetrics = createMockReq('http://localhost/api/admin/metrics');
    const resMetrics = await getMetrics(reqMetrics);
    assert.strictEqual(resMetrics.status, 401, 'admin/metrics route must return 401 when unauthenticated');
    console.log('     ✅ GET /api/admin/metrics returned 401 when unauthenticated');

    // -------------------------------------------------------------
    // 2️⃣ Test Finding 2: Legacy fallback removal for sess-, user_session_, demo-
    // -------------------------------------------------------------
    console.log('\n  2️⃣ Testing Finding 2 (Removal of legacy session prefix fallback)...');

    const fakePrefixes = ['sess-fake-12345678', 'user_session_fake_token', 'demo-fake-session-id'];
    for (const fakeSessionId of fakePrefixes) {
      const reqFakeSession = createMockReq('http://localhost/api/tenders/ask', {
        cookies: { tender_session_id: fakeSessionId },
        body: { tenderId: 't-1', question: 'test' }
      });
      const resFakeSession = await askTender(reqFakeSession);
      assert.strictEqual(resFakeSession.status, 401, `Fake session '${fakeSessionId}' must receive 401`);
      console.log(`     ✅ Cookie tender_session_id=${fakeSessionId} correctly returned 401 Unauthorized`);
    }

    // -------------------------------------------------------------
    // 3️⃣ Test Finding 3: ALLOW_DEMO_AUTH environment flag requirement
    // -------------------------------------------------------------
    console.log('\n  3️⃣ Testing Finding 3 (ALLOW_DEMO_AUTH environment flag requirement)...');

    // Without ALLOW_DEMO_AUTH -> 401
    delete process.env.ALLOW_DEMO_AUTH;
    process.env.NODE_ENV = 'production';

    const reqNoDemoFlag = createMockReq('http://localhost/api/tenders/ask');
    const authResultNoFlag = await validateApiAuth(reqNoDemoFlag);
    assert.strictEqual(authResultNoFlag.authorized, false, 'Without ALLOW_DEMO_AUTH, validateApiAuth must fail');
    assert.strictEqual(authResultNoFlag.response?.status, 401);
    console.log('     ✅ Production unauthenticated request without ALLOW_DEMO_AUTH rejected with 401');

    // With ALLOW_DEMO_AUTH=true -> demo-user-id allowed
    process.env.ALLOW_DEMO_AUTH = 'true';
    const reqWithDemoFlag = createMockReq('http://localhost/api/tenders/ask');
    const authResultWithFlag = await validateApiAuth(reqWithDemoFlag);
    assert.strictEqual(authResultWithFlag.authorized, true);
    assert.strictEqual(authResultWithFlag.userId, 'demo-user-id');
    console.log('     ✅ With ALLOW_DEMO_AUTH=true, demo-user-id fallback operates as expected');

    // -------------------------------------------------------------
    // 4️⃣ Test Finding 5: Email enumeration protection on registration
    // -------------------------------------------------------------
    console.log('\n  4️⃣ Testing Finding 5 (Email enumeration protection on registration)...');

    const testEmail = `enum_protection_${Date.now()}@tender.ai`;
    const testPassword = 'Password123!';

    // Register user first time
    const regReq1 = createMockReq('http://localhost/api/auth/register', {
      body: { email: testEmail, password: testPassword, name: 'First User' }
    });
    const regRes1 = await registerHandler(regReq1);
    assert.strictEqual(regRes1.status, 200, 'Initial registration must succeed with 200');

    // Register user second time (duplicate)
    const regReq2 = createMockReq('http://localhost/api/auth/register', {
      body: { email: testEmail, password: testPassword, name: 'Duplicate User' }
    });
    const regRes2 = await registerHandler(regReq2);
    assert.strictEqual(regRes2.status, 400, 'Duplicate registration must return 400');
    const dataReg2 = await regRes2.json();
    assert.strictEqual(
      dataReg2.message,
      'Не удалось зарегистрироваться. Проверьте данные или попробуйте войти.',
      'Duplicate registration message must match generic non-enumerating error'
    );
    console.log('     ✅ Duplicate registration returns 400 with non-enumerating generic message');

    console.log('\n🎉 ALL AUTH AUDIT CRITICAL FIXES TESTS PASSED SUCCESSFULLY!\n');
  } finally {
    process.env.NODE_ENV = origEnv;
    if (origAllowDemo !== undefined) {
      process.env.ALLOW_DEMO_AUTH = origAllowDemo;
    } else {
      delete process.env.ALLOW_DEMO_AUTH;
    }
  }
}

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Auth Audit Critical Fixes Test Failed:', err);
    process.exit(1);
  });
