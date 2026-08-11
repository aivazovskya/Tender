require('tsx/cjs');
const assert = require('assert');

console.log('🧪 [Test Suite] Testing Code Review Defect Fixes (Price-Benchmark Auth & Reputation Demo-Fallback)...\n');

(async () => {
  // 1. Test Price-Benchmark Route Authorization Guard
  console.log('▶ 1. Testing GET /api/tenders/[id]/price-benchmark Authorization Guard...');
  const { GET: benchmarkGET } = require('../../src/app/api/tenders/[id]/price-benchmark/route');

  // 1a. Unauthenticated Request (No Auth header/session) -> HTTP 401
  const reqUnauth = {
    headers: { get: () => null }
  };
  const resUnauth = await benchmarkGET(reqUnauth, { params: { id: '777100-2026' } });
  assert.strictEqual(resUnauth.status, 401, 'Unauthenticated request must return HTTP 401 Unauthorized');
  console.log('  ✅ Unauthenticated request correctly rejected with HTTP 401 Unauthorized!');

  // 1b. Authenticated Request (With Admin Key) -> HTTP 200
  process.env.ADMIN_API_KEY = 'secret-admin-key-123';
  const reqAuth = {
    headers: {
      get: (k) => k.toLowerCase() === 'authorization' ? 'Bearer secret-admin-key-123' : null
    }
  };
  const resAuth = await benchmarkGET(reqAuth, { params: { id: 't-101' } });
  assert.strictEqual(resAuth.status, 200, 'Authenticated request must return HTTP 200 OK');
  const bodyAuth = await resAuth.json();
  assert.strictEqual(bodyAuth.success, true);
  assert(bodyAuth.benchmark, 'Response must contain benchmark object');
  console.log('  ✅ Authenticated request returned HTTP 200 OK with benchmark statistics!');

  // 2. Test Reputation Service Demo Fallback Flag
  console.log('\n▶ 2. Testing Reputation Service Demo Fallback Flag (Unconfigured Token)...');
  const origToken = process.env.GOSZAKUP_API_TOKEN;
  delete process.env.GOSZAKUP_API_TOKEN;
  delete process.env.SAMRUK_API_TOKEN;

  const { ReputationService } = require('../../src/lib/services/reputation.service');
  const repResult = await ReputationService.checkBin('990101300999', 'CUSTOMER');

  assert.strictEqual(repResult.isFallback, true, 'Unconfigured API token must return isFallback: true');
  assert.strictEqual(repResult.source, 'DEMO_FALLBACK', 'Unconfigured API token must set source: DEMO_FALLBACK');
  assert(repResult.reason.includes('Демо-режим') || repResult.reason.includes('не настроен'), 'Reason must indicate demo mode');
  console.log('  ✅ Unconfigured GOSZAKUP_API_TOKEN correctly returns isFallback: true & source: DEMO_FALLBACK!');

  if (origToken) {
    process.env.GOSZAKUP_API_TOKEN = origToken;
  }

  console.log('\n🎉 All Code Review Defect Fix Tests Passed Successfully!');
})().catch(err => {
  console.error('💥 Test Execution Error:', err);
  process.exit(1);
});
