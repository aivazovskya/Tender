require('tsx/cjs');
const assert = require('assert');
const { validateExportAccess, validateReputationAccess } = require('../../src/lib/security/subscription-guard');

console.log('🧪 [Security Test Suite] Testing X-User-Plan Header Bypass Vulnerability (Hotfix)...\n');

function mockReq(headersObj = {}, cookiesObj = {}) {
  return {
    headers: {
      get: (key) => headersObj[key.toLowerCase()] || headersObj[key] || null
    },
    cookies: {
      get: (key) => cookiesObj[key] ? { value: cookiesObj[key] } : null
    }
  };
}

(async () => {
  const origNodeEnv = process.env.NODE_ENV;
  const origAllowDemo = process.env.ALLOW_DEMO_AUTH;

  try {
    // -------------------------------------------------------------
    // Test 1: Production Environment (NODE_ENV = 'production')
    // -------------------------------------------------------------
    console.log('▶ 1. Testing Production Mode (NODE_ENV = "production")...');
    process.env.NODE_ENV = 'production';
    delete process.env.ALLOW_DEMO_AUTH;

    // Attacker sends X-User-Plan: ENTERPRISE on FREE account request
    const exportAttackerRes = await validateExportAccess(mockReq({ 'X-User-Plan': 'ENTERPRISE' }));
    assert.strictEqual(exportAttackerRes.authorized, false, 'Production mode MUST reject X-User-Plan header bypass for export!');
    assert.strictEqual(exportAttackerRes.response.status, 403, 'Production mode MUST return 403 Forbidden for unprivileged export request');
    console.log('  ✅ Export access correctly blocked (403 Forbidden) despite X-User-Plan: ENTERPRISE header in production!');

    const repAttackerRes = await validateReputationAccess(mockReq({ 'X-User-Plan': 'ENTERPRISE' }));
    assert.strictEqual(repAttackerRes.authorized, false, 'Production mode MUST reject X-User-Plan header bypass for reputation check!');
    assert.strictEqual(repAttackerRes.response.status, 403, 'Production mode MUST return 403 Forbidden for unprivileged reputation request');
    console.log('  ✅ Reputation check access correctly blocked (403 Forbidden) despite X-User-Plan: ENTERPRISE header in production!');

    // -------------------------------------------------------------
    // Test 2: ALLOW_DEMO_AUTH = 'false' in non-production
    // -------------------------------------------------------------
    console.log('\n▶ 2. Testing Non-Production with ALLOW_DEMO_AUTH disabled...');
    process.env.NODE_ENV = 'development';
    process.env.ALLOW_DEMO_AUTH = 'false';

    const devBypassRes = await validateExportAccess(mockReq({ 'X-User-Plan': 'ENTERPRISE' }));
    assert.strictEqual(devBypassRes.authorized, false, 'Header bypass MUST be rejected when ALLOW_DEMO_AUTH is false');
    console.log('  ✅ X-User-Plan header ignored when ALLOW_DEMO_AUTH is disabled!');

    // -------------------------------------------------------------
    // Test 3: ALLOW_DEMO_AUTH = 'true' in non-production (Developer/Demo mode)
    // -------------------------------------------------------------
    console.log('\n▶ 3. Testing Non-Production with ALLOW_DEMO_AUTH = "true" (Demo/Dev mode)...');
    process.env.NODE_ENV = 'development';
    process.env.ALLOW_DEMO_AUTH = 'true';

    const demoExportRes = await validateExportAccess(mockReq({ 'X-User-Plan': 'TEAM' }));
    assert.strictEqual(demoExportRes.authorized, true, 'Header override MUST work ONLY when ALLOW_DEMO_AUTH is true in non-production');
    console.log('  ✅ X-User-Plan header override works in demo mode when explicitly enabled!');

    const demoRepRes = await validateReputationAccess(mockReq({ 'X-User-Plan': 'PRO' }));
    assert.strictEqual(demoRepRes.authorized, true, 'Header override MUST work ONLY when ALLOW_DEMO_AUTH is true in non-production');
    console.log('  ✅ Reputation check header override works in demo mode when explicitly enabled!');

    // -------------------------------------------------------------
    // Test 4: ADMIN role / Legitimate access in production
    // -------------------------------------------------------------
    console.log('\n▶ 4. Testing Admin & Database Role Validation in Production...');
    process.env.NODE_ENV = 'production';
    delete process.env.ALLOW_DEMO_AUTH;
    process.env.ADMIN_API_KEY = 'secret-admin-key-123';

    // Admin via API key
    const adminExportRes = await validateExportAccess(mockReq({ 'Authorization': 'Bearer secret-admin-key-123' }));
    assert.strictEqual(adminExportRes.authorized, true, 'Admin key MUST be authorized in production without header plan');
    console.log('  ✅ Admin user successfully authorized for export in production!');

    const adminRepRes = await validateReputationAccess(mockReq({ 'Authorization': 'Bearer secret-admin-key-123' }));
    assert.strictEqual(adminRepRes.authorized, true, 'Admin key MUST be authorized in production without header plan');
    console.log('  ✅ Admin user successfully authorized for reputation check in production!');

    console.log('\n🎉 Security Test Suite for Subscription Header Bypass Completed Successfully!');
  } finally {
    process.env.NODE_ENV = origNodeEnv;
    if (origAllowDemo !== undefined) {
      process.env.ALLOW_DEMO_AUTH = origAllowDemo;
    } else {
      delete process.env.ALLOW_DEMO_AUTH;
    }
  }
})().catch(err => {
  console.error('💥 Test Execution Error:', err);
  process.exit(1);
});
