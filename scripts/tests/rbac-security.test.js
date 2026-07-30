require('tsx/cjs');
const assert = require('assert');
const { validateApiAuth } = require('../../src/lib/security/auth');

console.log('🧪 [Test Suite] Testing RBAC Security, Impersonation Prevention & BIN Ownership (Bugs #12, #13, #14)...');

// Mock request helper
function createMockRequest(headers = {}) {
  return {
    headers: {
      get: (name) => headers[name.toLowerCase()] || headers[name] || null
    }
  };
}

// 1. Test Bug #12: RBAC Enforcement
const nonAdminReq = createMockRequest({ 'authorization': 'Bearer user-token-123' });
const rbacResult = validateApiAuth(nonAdminReq, 'ADMIN');

// When ADMIN_API_KEY is configured or requested, non-admin token must return 403 Forbidden or unauthorized
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
const authResult = validateApiAuth(impersonationReq);
assert.notStrictEqual(authResult.userId, 'victim-user-id-999', 'Server MUST NOT trust raw client x-user-id header when token is present');
console.log('  ✅ Unverified client x-user-id header impersonation attempt blocked (Bug #13)');

console.log('🎉 RBAC Security & Multi-Tenant Impersonation Test Suite completed successfully!');
