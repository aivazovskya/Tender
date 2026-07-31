require('tsx/cjs');
const assert = require('assert');

console.log('🧪 [Test Suite] Testing Enterprise Public REST API v1 & API Key Management (Task / ТЗ Public API & API Keys)...\n');

(async () => {
  const { 
    createApiKeyForUser, 
    revokeApiKeyForUser, 
    validatePublicApiKey,
    listApiKeysForUser
  } = require('../../src/lib/security/public-api-guard');

  const { GET: tendersPublicGET } = require('../../src/app/api/public/v1/tenders/route');
  const { GET: tenderSinglePublicGET } = require('../../src/app/api/public/v1/tenders/[id]/route');
  const { GET: kanbanPublicGET, POST: kanbanPublicPOST } = require('../../src/app/api/public/v1/kanban/route');

  // Request helper
  function mockReq(apiKey, body = null, url = 'http://localhost/api/public/v1/tenders') {
    return {
      url,
      headers: {
        get: (k) => k.toLowerCase() === 'x-api-key' ? apiKey : null
      },
      json: async () => (body || {})
    };
  }

  // 1. Acceptance Criteria #4: Random / Arbitrary string in x-api-key gets 401 Unauthorized (Fixing Vulnerability)
  console.log('▶ 1. Testing Random String Vulnerability Fix (Unissued x-api-key)...');
  const fakeKeyRes = await validatePublicApiKey(mockReq('invalid_random_unissued_key_9999'));
  assert.strictEqual(fakeKeyRes.authorized, false, 'Arbitrary unissued key must be rejected');
  assert.strictEqual(fakeKeyRes.response.status, 401, 'Arbitrary unissued key must return HTTP 401');
  console.log('  ✅ Arbitrary/random x-api-key string correctly rejected with HTTP 401 Unauthorized!');

  // 2. Acceptance Criteria #1 & #5: Generated key works for initial requests and headers
  console.log('\n▶ 2. Testing API Key Generation & Public REST API v1 Endpoints...');
  const userId = 'user-enterprise-test-101';
  const { rawKey, record } = await createApiKeyForUser(userId, '1С Интеграция УТ');

  assert(rawKey.startsWith('tnd_ai_'), 'Raw API key must start with tnd_ai_ prefix');
  assert.strictEqual(record.label, '1С Интеграция УТ');
  assert(record.keyPrefix.includes('...'), 'keyPrefix must be masked');
  assert(!record.keyPrefix.includes(rawKey), 'keyPrefix must NOT expose full raw key');
  console.log(`  ✅ API key issued successfully (Prefix: ${record.keyPrefix}, Raw length: ${rawKey.length})!`);

  // Validate issued key with guard
  const valRes = await validatePublicApiKey(mockReq(rawKey));
  assert.strictEqual(valRes.authorized, true, 'Issued Enterprise key must be authorized');
  assert.strictEqual(valRes.userId, userId);
  console.log('  ✅ validatePublicApiKey correctly authorized issued key!');

  // Test GET /api/public/v1/tenders with issued key
  const tendersRes = await tendersPublicGET(mockReq(rawKey, null, 'http://localhost/api/public/v1/tenders?region=%D0%B3.+%D0%90%D1%81%D1%82%D0%B0%D0%BD%D0%B0'));
  assert.strictEqual(tendersRes.status, 200, 'GET /api/public/v1/tenders must return 200 OK with valid key');
  const tendersData = await tendersRes.json();
  assert.strictEqual(tendersData.success, true);
  assert(Array.isArray(tendersData.tenders), 'tenders must be an array');
  console.log(`  ✅ GET /api/public/v1/tenders responded HTTP 200 OK (${tendersData.count} tenders returned)!`);

  // Test GET /api/public/v1/tenders/[id] with issued key
  const singleTenderRes = await tenderSinglePublicGET(mockReq(rawKey), { params: { id: 't-101' } });
  assert.strictEqual(singleTenderRes.status, 200);
  const singleData = await singleTenderRes.json();
  assert.strictEqual(singleData.success, true);
  assert.strictEqual(singleData.tender.id, 't-101');
  console.log('  ✅ GET /api/public/v1/tenders/t-101 responded HTTP 200 OK with tender details!');

  // Test GET & POST /api/public/v1/kanban with issued key
  const kanbanGetRes = await kanbanPublicGET(mockReq(rawKey));
  assert.strictEqual(kanbanGetRes.status, 200);
  const kanbanGetData = await kanbanGetRes.json();
  assert.strictEqual(kanbanGetData.success, true);
  console.log(`  ✅ GET /api/public/v1/kanban responded HTTP 200 OK (${kanbanGetData.count} cards)!`);

  const kanbanPostRes = await kanbanPublicPOST(mockReq(rawKey, {
    tenderId: 't-101',
    stage: 'SUBMITTED',
    priority: 'HIGH',
    assignee: 'Интеграция 1С',
    notes: 'Подано из 1С через Public REST API'
  }));
  assert.strictEqual(kanbanPostRes.status, 200);
  const kanbanPostData = await kanbanPostRes.json();
  assert.strictEqual(kanbanPostData.success, true);
  assert.strictEqual(kanbanPostData.card.stage, 'SUBMITTED');
  console.log('  ✅ POST /api/public/v1/kanban responded HTTP 200 OK (Card stage updated to SUBMITTED)!');

  // 3. Acceptance Criteria #2: Revoked key immediately stops authorizing
  console.log('\n▶ 3. Testing Revoked Key Enforcement (revokedAt !== null)...');
  const revokeSuccess = await revokeApiKeyForUser(record.id, userId);
  assert.strictEqual(revokeSuccess, true, 'Revocation must succeed');

  const revokedValRes = await validatePublicApiKey(mockReq(rawKey));
  assert.strictEqual(revokedValRes.authorized, false, 'Revoked key must be denied');
  assert.strictEqual(revokedValRes.response.status, 401, 'Revoked key must return HTTP 401');

  const revokedTendersRes = await tendersPublicGET(mockReq(rawKey));
  assert.strictEqual(revokedTendersRes.status, 401, 'Revoked key request to tenders endpoint must return 401');
  console.log('  ✅ Revoked API key immediately returns HTTP 401 Unauthorized!');

  // 4. Acceptance Criteria #3: Key issued on Enterprise account that is downgraded to PRO/FREE stops working
  console.log('\n▶ 4. Testing Downgrade Security Enforcement (Enterprise -> PRO)...');
  const { rawKey: downgradeKey, record: downgradeRecord } = await createApiKeyForUser('user-downgraded-user', 'CRM key');

  // Mock downgrade check
  const { prisma } = require('../../src/lib/prisma');
  const origFind = prisma.companyProfile.findFirst;
  prisma.companyProfile.findFirst = async () => ({ subscriptionPlan: 'PRO' });

  const downgradedValRes = await validatePublicApiKey(mockReq(downgradeKey));
  assert.strictEqual(downgradedValRes.authorized, false, 'Downgraded user key must be rejected');
  assert.strictEqual(downgradedValRes.response.status, 401, 'Downgraded user key must return HTTP 401');
  console.log('  ✅ Downgraded account (Enterprise -> PRO) key correctly rejected with HTTP 401 Unauthorized!');

  // Restore prisma mock
  prisma.companyProfile.findFirst = origFind;

  console.log('\n🎉 Enterprise Public REST API v1 & API Key Management Test Suite completed successfully!');
})().catch(err => {
  console.error('💥 Test Execution Error:', err);
  process.exit(1);
});
