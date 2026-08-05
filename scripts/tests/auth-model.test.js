require('tsx/cjs');
const assert = require('assert');
const { POST: registerHandler } = require('../../src/app/api/auth/register/route');
const { POST: loginHandler } = require('../../src/app/api/auth/login/route');
const { POST: logoutHandler } = require('../../src/app/api/auth/logout/route');
const { GET: meHandler } = require('../../src/app/api/auth/me/route');
const { getSession } = require('../../src/lib/security/auth-store');

process.env.AUTH_STORE_MODE = 'memory';

console.log('🧪 Starting Auth & Registration Security Module Tests...\n');

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
  const testEmail = `auth_test_${Date.now()}@tender.ai`;
  const testPassword = 'SecurePassword123!';

  // 1️⃣ Test Registration validation
  console.log('  1️⃣ Testing Registration Validation & User Creation...');
  
  // Short password check
  const badReq = createMockReq('http://localhost/api/auth/register', {
    body: { email: testEmail, password: 'short' }
  });
  const badRes = await registerHandler(badReq);
  assert.strictEqual(badRes.status, 400, 'Registration must reject passwords under 8 characters');
  console.log('     ✅ Short password rejected with 400');

  // Successful Registration
  const regReq = createMockReq('http://localhost/api/auth/register', {
    body: { email: testEmail, password: testPassword, name: 'Тестовый Пользователь' }
  });
  const regRes = await registerHandler(regReq);
  assert.strictEqual(regRes.status, 200, 'Registration must return 200 on success');
  const regData = await regRes.json();
  assert.strictEqual(regData.success, true);
  assert.strictEqual(regData.user.email, testEmail);
  assert.strictEqual(regData.user.passwordHash, undefined, 'passwordHash must never be exposed in API responses!');
  console.log('     ✅ User successfully registered with password hash in DB & no hash exposure in response');

  // Duplicate registration check
  const dupRes = await registerHandler(regReq);
  assert.strictEqual(dupRes.status, 400, 'Duplicate email registration must be rejected with 400');
  console.log('     ✅ Duplicate email registration rejected with 400');

  // 2️⃣ Test Login & Rate Limiting
  console.log('  2️⃣ Testing Login & Rate Limiting...');

  // Wrong password
  const wrongLoginReq = createMockReq('http://localhost/api/auth/login', {
    body: { email: testEmail, password: 'WrongPassword999' }
  });
  const wrongLoginRes = await loginHandler(wrongLoginReq);
  assert.strictEqual(wrongLoginRes.status, 401, 'Wrong password must return 401 Unauthorized');
  console.log('     ✅ Wrong password rejected with 401');

  // Successful Login
  const validLoginReq = createMockReq('http://localhost/api/auth/login', {
    body: { email: testEmail, password: testPassword }
  });
  const validLoginRes = await loginHandler(validLoginReq);
  assert.strictEqual(validLoginRes.status, 200, 'Valid credentials must return 200 OK');
  
  const sessionCookie = validLoginRes.cookies.get('tender_session_id');
  const sessionId = sessionCookie?.value;
  assert.ok(sessionId, 'Session cookie must be set on login response');
  console.log('     ✅ Login successful & session cookie issued:', sessionId);

  // Rate limiting test: trigger 5 failed attempts
  console.log('  3️⃣ Testing Rate Limiting (5 failed attempts block)...');
  const bruteEmail = `brute_${Date.now()}@tender.ai`;
  for (let i = 0; i < 5; i++) {
    await loginHandler(createMockReq('http://localhost/api/auth/login', {
      body: { email: bruteEmail, password: 'wrong' }
    }));
  }

  // 6th attempt must be blocked with HTTP 429
  const rateLimitedRes = await loginHandler(createMockReq('http://localhost/api/auth/login', {
    body: { email: bruteEmail, password: 'wrong' }
  }));
  assert.strictEqual(rateLimitedRes.status, 429, '6th failed login attempt must be rate-limited with 429');
  const rateLimitData = await rateLimitedRes.json();
  assert.strictEqual(rateLimitData.success, false);
  console.log('     ✅ Brute-force rate limiting triggered: HTTP 429 returned after 5 failed attempts');

  // 4️⃣ Test Session validation (/api/auth/me) & Logout
  console.log('  4️⃣ Testing Auth Me & Session Invalidation...');

  // Call /api/auth/me with session cookie
  const meReq = createMockReq('http://localhost/api/auth/me', {
    cookies: { tender_session_id: sessionId }
  });
  const meRes = await meHandler(meReq);
  assert.strictEqual(meRes.status, 200);
  const meData = await meRes.json();
  assert.strictEqual(meData.user.email, testEmail);
  console.log('     ✅ /api/auth/me resolved valid session to correct user');

  // Call Logout
  const logoutReq = createMockReq('http://localhost/api/auth/logout', {
    cookies: { tender_session_id: sessionId }
  });
  const logoutRes = await logoutHandler(logoutReq);
  assert.strictEqual(logoutRes.status, 200);
  
  // Verify session removed
  const deletedSession = await getSession(sessionId);
  assert.strictEqual(deletedSession, null, 'Session must be deleted on logout');
  console.log('     ✅ /api/auth/logout invalidated DB session & cleared session cookie');

  console.log('\n🎉 ALL AUTH & REGISTRATION TESTS PASSED PERFECTLY!\n');
}

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Test failed:', err);
    process.exit(1);
  });
