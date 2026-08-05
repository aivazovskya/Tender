require('tsx/cjs');
const assert = require('assert');
const { validateApiAuth } = require('../../src/lib/security/auth');

console.log('🧪 [Test Suite] Testing RBAC Security, Impersonation Prevention & Production Availability (Bugs #12, #13, #14, #15, #16)...');

// Mock request helper
function createMockRequest(headers = {}) {
  return {
    headers: {
      get: (name) => headers[name.toLowerCase()] || headers[name] || null
    }
  };
}

async function runTests() {
  // 1. Test Bug #12: RBAC Enforcement
  const nonAdminReq = createMockRequest({ 'authorization': 'Bearer user-token-123' });
  const rbacResult = await validateApiAuth(nonAdminReq, 'ADMIN');

  assert.strictEqual(rbacResult.role, 'USER', 'Non-admin token must resolve role as USER');
  if (rbacResult.response) {
    assert.strictEqual(rbacResult.response.status, 403, 'Requesting ADMIN role without admin privileges MUST return HTTP 403');
    console.log('  ✅ Non-admin token requesting ADMIN role rejected with HTTP 403 Forbidden (Bug #12)');
  } else {
    assert.strictEqual(rbacResult.authorized, false);
  }

  // 2. Test Bug #13: Client Header Impersonation Prevention
  const impersonationReq = createMockRequest({
    'authorization': 'Bearer user-token-abc',
    'x-user-id': 'victim-user-id-999'
  });
  const authResult = await validateApiAuth(impersonationReq);
  assert.notStrictEqual(authResult.userId, 'victim-user-id-999', 'Server MUST NOT trust raw client x-user-id header when token is present');
  console.log('  ✅ Unverified client x-user-id header impersonation attempt blocked (Bug #13)');

  // 3. Test Bug #15: Eliminate admin- token prefix fallback bypass when ADMIN_API_KEY is unset
  delete process.env.ADMIN_API_KEY;
  delete process.env.API_SECRET_KEY;
  const fakeAdminPrefixReq = createMockRequest({ 'authorization': 'Bearer admin-unauthorized-key' });
  const fakeAdminResult = await validateApiAuth(fakeAdminPrefixReq, 'ADMIN');
  assert.strictEqual(fakeAdminResult.role, 'USER', 'Token starting with admin- MUST NOT grant ADMIN role when ADMIN_API_KEY is not set');
  assert.strictEqual(fakeAdminResult.authorized, false, 'Unauthenticated admin- token attempt MUST be rejected');
  console.log('  ✅ Fake admin- token prefix fallback bypass blocked when ADMIN_API_KEY is not set (Bug #15)');

  // 4. Test Finding 3: Production unauthenticated user request requires ALLOW_DEMO_AUTH=true for demo access
  const originalEnv = process.env.NODE_ENV;
  const originalAllowDemo = process.env.ALLOW_DEMO_AUTH;
  process.env.NODE_ENV = 'production';
  delete process.env.ALLOW_DEMO_AUTH;

  const prodUserReqNoFlag = createMockRequest({});
  const prodUserResultNoFlag = await validateApiAuth(prodUserReqNoFlag);
  assert.strictEqual(prodUserResultNoFlag.authorized, false, 'Without ALLOW_DEMO_AUTH, unauthenticated request MUST return 401');
  assert.strictEqual(prodUserResultNoFlag.response.status, 401);
  console.log('  ✅ Production user routes without token/session return 401 when ALLOW_DEMO_AUTH is disabled');

  process.env.ALLOW_DEMO_AUTH = 'true';
  const prodUserReqWithFlag = createMockRequest({});
  const prodUserResultWithFlag = await validateApiAuth(prodUserReqWithFlag);
  assert.strictEqual(prodUserResultWithFlag.authorized, true, 'With ALLOW_DEMO_AUTH=true, demo user access is granted');
  assert.strictEqual(prodUserResultWithFlag.userId, 'demo-user-id');
  console.log('  ✅ With ALLOW_DEMO_AUTH=true, demo-user-id fallback operates as expected');

  const prodAdminReq = createMockRequest({});
  const prodAdminResult = await validateApiAuth(prodAdminReq, 'ADMIN');
  assert.strictEqual(prodAdminResult.authorized, false, 'ADMIN route without token MUST return 401 in production');
  assert.strictEqual(prodAdminResult.response.status, 401, 'ADMIN route without token MUST return HTTP 401 Unauthorized');
  console.log('  ✅ Production ADMIN routes strictly enforce HTTP 401 Unauthorized when token is missing (Bug #16)');

  process.env.NODE_ENV = originalEnv;
  if (originalAllowDemo !== undefined) {
    process.env.ALLOW_DEMO_AUTH = originalAllowDemo;
  } else {
    delete process.env.ALLOW_DEMO_AUTH;
  }

  console.log('🎉 RBAC Security & Multi-Tenant Impersonation Test Suite completed successfully!');
}

runTests()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ rbac-security test failed:', err);
    process.exit(1);
  });
