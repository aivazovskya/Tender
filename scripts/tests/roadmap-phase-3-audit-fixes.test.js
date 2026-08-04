require('tsx/cjs');
const assert = require('assert');
const { GET: getSecurity, POST: postSecurity } = require('../../src/app/api/security-instruments/route');
const { POST: generateDoc } = require('../../src/app/api/tenders/[id]/documents/generate/route');
const { GET: getManagementReport } = require('../../src/app/api/reports/management/route');
const { GET: checkSecurityExpiry } = require('../../src/app/api/notifications/check-security-expiry/route');
const { GET: downloadDoc } = require('../../src/app/api/tenders/[id]/documents/download/route');
const { DEFAULT_PENALTY_RATE_PER_DAY } = require('../../src/lib/constants/tender-risk');
const { prisma } = require('../../src/lib/prisma');

console.log('🧪 Starting Roadmap Phase 3 Audit Findings Verification Tests...\n');

function createMockReq(urlStr, options = {}) {
  const headers = options.headers || {};
  return {
    url: urlStr,
    headers: {
      get: (key) => headers[key.toLowerCase()] || headers[key] || null
    },
    json: async () => options.body || {}
  };
}

async function runTests() {
  // Test Finding 1: IDOR Prevention in security-instruments & documents/generate
  console.log('  1️⃣ Testing Finding 1 (IDOR via companyProfile resolution)...');

  const orphanUserId = `no-profile-user-${Date.now()}`;
  const mockReqOrphanGET = createMockReq('http://localhost/api/security-instruments', {
    headers: { 'x-user-id': orphanUserId }
  });

  const resOrphanGET = await getSecurity(mockReqOrphanGET);
  assert.strictEqual(resOrphanGET.status, 404, 'GET /api/security-instruments must return 404 for user without profile');
  const dataOrphanGET = await resOrphanGET.json();
  assert.strictEqual(dataOrphanGET.success, false);
  console.log('     ✅ GET /api/security-instruments returned 404 for profile-less user (no IDOR leak)');

  const mockReqOrphanPOST = createMockReq('http://localhost/api/security-instruments', {
    headers: { 'x-user-id': orphanUserId },
    body: {
      tenderId: 't-101',
      type: 'BANK_GUARANTEE',
      amount: 100000,
      issueDate: new Date().toISOString(),
      expiryDate: new Date().toISOString()
    }
  });

  const resOrphanPOST = await postSecurity(mockReqOrphanPOST);
  assert.strictEqual(resOrphanPOST.status, 404, 'POST /api/security-instruments must return 404 for user without profile');
  console.log('     ✅ POST /api/security-instruments returned 404 for profile-less user');

  const mockReqOrphanDocGen = createMockReq('http://localhost/api/tenders/t-101/documents/generate', {
    headers: { 'x-user-id': orphanUserId },
    body: { templateId: 'tmpl-101' }
  });

  const resOrphanDocGen = await generateDoc(mockReqOrphanDocGen, { params: { id: 't-101' } });
  assert.strictEqual(resOrphanDocGen.status, 404, 'POST /api/tenders/[id]/documents/generate must return 404 for user without profile');
  console.log('     ✅ POST /api/tenders/[id]/documents/generate returned 404 for profile-less user');

  // Test Finding 2: Management Report RBAC Bypass Fix
  console.log('\n  2️⃣ Testing Finding 2 (Management Report RBAC bypass fix)...');

  const demoReq = createMockReq('http://localhost/api/reports/management', {
    headers: {} // Defaults to demo-user-id in auth helper
  });

  const demoRes = await getManagementReport(demoReq);
  assert.strictEqual(demoRes.status, 403, 'Unauthenticated/demo-user-id request to management report must return 403');
  const demoData = await demoRes.json();
  assert.strictEqual(demoData.success, false);
  console.log('     ✅ Unauthenticated/demo request returned 403 Forbidden for management report');

  const memberReq = createMockReq('http://localhost/api/reports/management', {
    headers: { 'x-user-id': 'regular-member-user-999' }
  });

  const memberRes = await getManagementReport(memberReq);
  assert.strictEqual(memberRes.status, 403, 'Regular member without OWNER/ADMIN role must return 403');
  console.log('     ✅ Regular MEMBER request returned 403 Forbidden');

  const adminReq = createMockReq('http://localhost/api/reports/management', {
    headers: { 'x-user-id': 'admin-super-user' }
  });

  const adminRes = await getManagementReport(adminReq);
  assert.strictEqual(adminRes.status, 200, 'Admin request to management report must return 200');
  const adminData = await adminRes.json();
  assert.strictEqual(adminData.success, true);
  console.log('     ✅ Admin request returned 200 OK with report data');

  // Test Finding 3: Security Expiry Cron Secret Protection
  console.log('\n  3️⃣ Testing Finding 3 (check-security-expiry cron secret protection)...');

  const origEnv = process.env.NODE_ENV;
  const origSecret = process.env.CRON_SECRET;
  process.env.NODE_ENV = 'production';
  process.env.CRON_SECRET = 'audit-test-cron-secret-12345';

  const unauthCronReq = createMockReq('http://localhost/api/notifications/check-security-expiry');
  const unauthCronRes = await checkSecurityExpiry(unauthCronReq);
  assert.strictEqual(unauthCronRes.status, 401, 'Cron request without secret in production must return 401');
  console.log('     ✅ Cron request without X-Cron-Secret returned 401 Unauthorized');

  const authCronReq = createMockReq('http://localhost/api/notifications/check-security-expiry', {
    headers: { 'x-cron-secret': 'audit-test-cron-secret-12345' }
  });
  const authCronRes = await checkSecurityExpiry(authCronReq);
  assert.strictEqual(authCronRes.status, 200, 'Cron request with valid X-Cron-Secret must return 200');
  console.log('     ✅ Cron request with valid X-Cron-Secret returned 200 OK');

  process.env.NODE_ENV = origEnv;
  process.env.CRON_SECRET = origSecret;

  // Test Finding 4: Penalty Rate Centralized Constant
  console.log('\n  4️⃣ Testing Finding 4 (Centralized penalty rate constant)...');
  assert.strictEqual(DEFAULT_PENALTY_RATE_PER_DAY, 0.001);
  console.log('     ✅ DEFAULT_PENALTY_RATE_PER_DAY verified as 0.001');

  // Test Finding 5: Document Download Auth & Ownership Check
  console.log('\n  5️⃣ Testing Finding 5 (Document download auth & ownership guard)...');

  // Create test user profiles & tender document
  const ownerUserId = `doc-owner-${Date.now()}`;
  const strangerUserId = `doc-stranger-${Date.now()}`;

  await prisma.user.upsert({
    where: { id: ownerUserId },
    update: {},
    create: {
      id: ownerUserId,
      email: `${ownerUserId}@test.kz`,
      name: 'Owner User',
      role: 'USER'
    }
  });

  const uniqueBin = String(Date.now()).slice(-12).padStart(12, '0');
  const ownerProfile = await prisma.companyProfile.create({
    data: {
      userId: ownerUserId,
      companyName: 'Owner Corp',
      bin: uniqueBin,
      activities: 'IT',
      contactEmail: 'owner@corp.kz'
    }
  });

  const testTender = await prisma.tender.upsert({
    where: { id: 'test-audit-tender-1' },
    update: {},
    create: {
      id: 'test-audit-tender-1',
      source: 'GOSZAKUP',
      externalId: 'AUDIT-101',
      title: 'Аудит Тест',
      customerName: 'Заказчик',
      customerBin: '987654321012',
      category: 'IT',
      amount: 1000000,
      currency: 'KZT',
      region: 'Астана',
      publishDate: new Date().toISOString(),
      deadlineDate: new Date().toISOString(),
      status: 'ACTIVE',
      sourceUrl: 'https://example.com'
    }
  });

  const testTemplate = await prisma.documentTemplate.upsert({
    where: { id: 'tmpl-audit-1' },
    update: {},
    create: {
      id: 'tmpl-audit-1',
      name: 'Аудит Шаблон',
      category: 'GENERAL',
      bodyTemplate: 'Шаблон {{companyName}}'
    }
  });

  const testGenDoc = await prisma.generatedDocument.create({
    data: {
      tenderId: testTender.id,
      templateId: testTemplate.id,
      companyProfileId: ownerProfile.id,
      fileUrl: `/api/tenders/${testTender.id}/documents/download`
    }
  });

  // 5a. Stranger attempts to download -> 403 Forbidden
  const strangerDownloadReq = createMockReq(`http://localhost/api/tenders/${testTender.id}/documents/download?docId=${testGenDoc.id}`, {
    headers: { 'x-user-id': strangerUserId }
  });
  const strangerDownloadRes = await downloadDoc(strangerDownloadReq, { params: { id: testTender.id } });
  assert.strictEqual(strangerDownloadRes.status, 403, 'Downloading stranger document must return 403 Forbidden');
  console.log('     ✅ Downloading document belonging to another user returned 403 Forbidden');

  // 5b. Legitimate owner downloads -> 200 OK
  const ownerDownloadReq = createMockReq(`http://localhost/api/tenders/${testTender.id}/documents/download?docId=${testGenDoc.id}`, {
    headers: { 'x-user-id': ownerUserId }
  });
  const ownerDownloadRes = await downloadDoc(ownerDownloadReq, { params: { id: testTender.id } });
  assert.strictEqual(ownerDownloadRes.status, 200, 'Legitimate owner document download must return 200 OK');
  console.log('     ✅ Legitimate owner document download returned 200 OK');

  console.log('\n🎉 Roadmap Phase 3 Audit Findings Verification Suite completed successfully!');
}

runTests().catch(err => {
  console.error('💥 Test failed:', err);
  process.exit(1);
});
