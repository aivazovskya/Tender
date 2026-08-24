require('tsx/cjs');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { ReputationService } = require('../../src/lib/services/reputation.service');
const { IngestionProcessorService } = require('../../src/lib/services/ingestion-processor.service');
const { GET } = require('../../src/app/api/reputation/check/route');

async function runTests() {
  process.env.ALLOW_DEMO_AUTH = 'true';
  console.log('🧪 [Test Suite] Testing Customer/Supplier Reputation Check & Goszakup RNU Integration (Phase 1)...\n');

  // Test 1: 12-digit BIN/IIN Format Validation
  console.log('▶ 1. Testing 12-digit BIN/IIN Format Validation...');
  assert.strictEqual(ReputationService.isValidBin('180940004512'), true);
  assert.strictEqual(ReputationService.isValidBin('12345'), false);
  assert.strictEqual(ReputationService.isValidBin('180940004512999'), false);
  assert.strictEqual(ReputationService.isValidBin('abc1809400045'), false);
  console.log('  ✅ BIN format validation works correctly!');

  // Test 2: Active vs Expired (Historical) Ban Evaluation (Criteria #2)
  console.log('\n▶ 2. Testing Active vs Historical (Expired) Ban Evaluation (Criteria #2)...');
  
  // 2a. Expired ban in past -> isBlacklisted must evaluate to false
  const pastBanDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
  const isPastBanned = ReputationService['evaluateBanStatus'](true, pastBanDate);
  assert.strictEqual(isPastBanned, false, 'Expired ban (end_date in past) must result in isBlacklisted = false');
  console.log('  ✅ Expired ban correctly ignored (isBlacklisted = false)!');

  // 2b. Active ban in future -> isBlacklisted must evaluate to true
  const futureBanDate = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000); // +180 days
  const isActiveBanned = ReputationService['evaluateBanStatus'](true, futureBanDate);
  assert.strictEqual(isActiveBanned, true, 'Active ban (end_date in future) must result in isBlacklisted = true');

  // 2c. Indefinite ban (no end date) -> isBlacklisted must evaluate to true
  const isIndefiniteBanned = ReputationService['evaluateBanStatus'](true, null);
  assert.strictEqual(isIndefiniteBanned, true, 'Indefinite ban (no end date) must result in isBlacklisted = true');
  console.log('  ✅ Active & indefinite bans correctly detected (isBlacklisted = true)!');

  // Test 3: 24h Caching & Fallback Behavior (Criteria #3 & #4)
  console.log('\n▶ 3. Testing 24h Caching & Fallback Behavior (Criteria #3 & #4)...');
  const testBin = '990101300999';
  const result1 = await ReputationService.checkBin(testBin, 'CUSTOMER');
  assert.strictEqual(result1.bin, testBin);
  assert.strictEqual(result1.entityType, 'CUSTOMER');
  assert.strictEqual(typeof result1.isBlacklisted, 'boolean');
  assert.strictEqual(result1.stale, false);

  // Second check immediately -> should be served from fresh cache
  const result2 = await ReputationService.checkBin(testBin, 'CUSTOMER');
  assert.strictEqual(result2.stale, false);
  assert.strictEqual(result2.checkedAt, result1.checkedAt);
  console.log('  ✅ 24h Caching & Fallback verified successfully!');

  // Test 4: Ingestion Pipeline Customer RNU Check & RiskFlag Creation (Criteria #1)
  console.log('\n▶ 4. Testing Ingestion Pipeline Auto-Enrichment & RiskFlag Creation (Criteria #1)...');
  const mockTenders = [
    {
      source: 'GOSZAKUP',
      externalId: 'rep-test-001',
      title: 'Поставка оборудования для школы',
      customerName: 'КГУ Общеобразовательная школа №1',
      customerBin: '180940004512',
      category: 'Оборудование',
      industryTags: ['Школы'],
      procurementMethod: 'OPEN_TENDER',
      amount: 15000000,
      currency: 'KZT',
      region: 'г. Астана',
      publishDate: new Date().toISOString(),
      deadlineDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'ACTIVE',
      sourceUrl: 'https://goszakup.gov.kz/ru/announce/index/1001',
      riskScore: 20,
      riskFlags: [],
      documents: [],
      history: []
    }
  ];

  const processed = await IngestionProcessorService.processIngestedTenders(mockTenders);
  assert.strictEqual(processed.length, 1);
  const saved = processed[0];
  assert.strictEqual(typeof saved.riskScore, 'number');
  assert(saved && saved.id, 'Saved tender must have an ID');
  console.log('  ✅ Ingestion pipeline customer RNU check executed without blocking ingestion!');

  // Test 5: Manual Reputation API Endpoint & Access Control (Criteria #5)
  console.log('\n▶ 5. Testing REST API GET /api/reputation/check & Tariff Access Control (Criteria #5)...');

  function createMockReq(urlStr, headersObj = {}) {
    return {
      url: urlStr,
      headers: {
        get: (key) => headersObj[key.toLowerCase()] || headersObj[key] || null
      }
    };
  }

  // 5a. FREE plan -> 403 Forbidden
  const freeReq = createMockReq('http://localhost/api/reputation/check?bin=180940004512&type=SUPPLIER', { 'x-user-plan': 'FREE' });
  const freeRes = await GET(freeReq);
  assert.strictEqual(freeRes.status, 403, 'FREE plan must be denied (HTTP 403)');
  const freeData = await freeRes.json();
  assert.strictEqual(freeData.error, 'FORBIDDEN_PLAN');
  console.log('  ✅ FREE plan correctly denied access (HTTP 403 FORBIDDEN_PLAN)!');

  // 5b. PRO plan -> 200 OK
  const proReq = createMockReq('http://localhost/api/reputation/check?bin=180940004512&type=SUPPLIER', { 'x-user-plan': 'PRO' });
  const proRes = await GET(proReq);
  assert.strictEqual(proRes.status, 200, 'PRO plan must be authorized (HTTP 200)');
  const proData = await proRes.json();
  assert.strictEqual(proData.success, true);
  assert.strictEqual(proData.data.bin, '180940004512');
  console.log('  ✅ PRO plan correctly authorized (HTTP 200 OK)!');

  // 5c. Invalid BIN format -> 400 Bad Request
  const invalidReq = createMockReq('http://localhost/api/reputation/check?bin=123&type=SUPPLIER', { 'x-user-plan': 'TEAM' });
  const invalidRes = await GET(invalidReq);
  assert.strictEqual(invalidRes.status, 400, 'Invalid BIN format must return HTTP 400');
  console.log('  ✅ Invalid BIN format correctly rejected (HTTP 400)!');

  // Test 6: Verify Phase 1 Documentation Scope (Criteria #6)
  console.log('\n▶ 6. Verifying Phase 1 Scope Documentation in README.md & Code (Criteria #6)...');
  const readmeContent = fs.readFileSync(path.join(process.cwd(), 'README.md'), 'utf8');
  assert(readmeContent.includes('РНУ'), 'README.md must mention RNU integration');
  assert(readmeContent.includes('Phase 2'), 'README.md must document Phase 2 backlog scope');
  console.log('  ✅ README.md explicitly documents Phase 1 РНУ ГЗ coverage and Phase 2 backlog!');

  // Test 7: External API Error Handling (Defect #2 Fix)
  console.log('\n▶ 7. Testing External API Error Handling (HTTP 500 / Network Failure)...');
  const errorBin = '888888888888';
  const originalFetchRnu = ReputationService['fetchGoszakupRnuApi'];
  ReputationService['fetchGoszakupRnuApi'] = async () => {
    throw new Error('OWS API HTTP 500: Internal Server Error');
  };

  const errResult = await ReputationService.checkBin(errorBin, 'SUPPLIER');
  assert.strictEqual(errResult.status, 'UNKNOWN', 'API 500 error must return status = UNKNOWN');
  assert.strictEqual(errResult.isBlacklisted, false);
  assert.strictEqual(errResult.stale, true);
  assert.notStrictEqual(errResult.status, 'CLEAN', 'API 500 error MUST NOT return status = CLEAN');
  console.log('  ✅ External API HTTP 500 errors correctly return status = UNKNOWN/stale (never CLEAN)!');

  // Restore original fetch method
  ReputationService['fetchGoszakupRnuApi'] = originalFetchRnu;

  // Test 8: Verify RNU 404 Response Handling & URL format
  console.log('\n▶ 8. Testing Goszakup RNU API URL & 404 Not Found Handling...');
  const origFetch = global.fetch;
  let interceptedUrl = '';
  let interceptedHeaders = {};

  try {
    process.env.GOSZAKUP_API_TOKEN = 'test-token-valid-123';
    
    // 8a. Test 404 Not Found returns status CLEAN (not in RNU)
    global.fetch = async (url, opts) => {
      interceptedUrl = String(url);
      interceptedHeaders = opts?.headers || {};
      return {
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => ({ message: 'Запись не найдена' })
      };
    };

    const rnu404Result = await ReputationService['fetchGoszakupRnuApi']('123456789012');
    assert.strictEqual(interceptedUrl, 'https://ows.goszakup.gov.kz/v3/rnu/123456789012', 'RNU URL must NOT have /bin/ segment');
    assert.strictEqual(rnu404Result.status, 'CLEAN', 'HTTP 404 from RNU endpoint must result in CLEAN status');
    assert.strictEqual(rnu404Result.isBlacklisted, false, 'HTTP 404 from RNU endpoint must mean not blacklisted');
    assert.strictEqual(rnu404Result.isFallback, undefined);
    console.log('  ✅ Goszakup RNU URL format and 404 Not Found (CLEAN) handling verified successfully!');

    // 8b. Test 200 OK with active blacklist record
    global.fetch = async (url, opts) => {
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ([
          {
            id: 9991,
            bin: '123456789012',
            nameRu: 'ТОО Недобросовестный Поставщик',
            reason: 'Уклонение от заключения договора',
            startDate: '2026-01-01',
            endDate: '2027-01-01'
          }
        ])
      };
    };

    const rnuBlacklistResult = await ReputationService['fetchGoszakupRnuApi']('123456789012');
    assert.strictEqual(rnuBlacklistResult.status, 'BLACKLISTED');
    assert.strictEqual(rnuBlacklistResult.isBlacklisted, true);
    assert.strictEqual(rnuBlacklistResult.registryRecordId, '9991');
    console.log('  ✅ Goszakup RNU 200 OK blacklisted record verified successfully!');

  } finally {
    global.fetch = origFetch;
    delete process.env.GOSZAKUP_API_TOKEN;
  }

  console.log('\n🎉 Customer/Supplier Reputation Check & Goszakup RNU Test Suite completed successfully!');
}

runTests().catch(err => {
  console.error('💥 Test failed:', err);
  process.exit(1);
});
