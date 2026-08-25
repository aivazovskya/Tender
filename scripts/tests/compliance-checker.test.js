require('tsx/cjs');
const assert = require('assert');
const { validateUrlForSSRF, isPrivateIp, resolveAndValidateHost } = require('../../src/lib/security/ssrf');
const { computeComplianceVerdict, GeminiComplianceLlmProvider } = require('../../src/lib/services/compliance-llm.service');
const { ComplianceExtractorService } = require('../../src/lib/services/compliance-extractor.service');
const { ComplianceProcessorService } = require('../../src/lib/services/compliance-processor.service');

async function runComplianceCheckerTests() {
  console.log('🧪 Starting Compliance Checker Automated Test Suite (ТЗ: Проверка соответствия товара)...');

  // =========================================================================
  // 1. SSRF Protection & DNS Pre-Resolution Security Tests
  // =========================================================================
  console.log('\n1️⃣ Testing SSRF Protection & Private IP Blocking...');

  // 1.1 Private IP Classifier
  assert.strictEqual(isPrivateIp('127.0.0.1'), true, '127.0.0.1 must be private');
  assert.strictEqual(isPrivateIp('10.0.1.5'), true, '10.x must be private');
  assert.strictEqual(isPrivateIp('192.168.1.100'), true, '192.168.x must be private');
  assert.strictEqual(isPrivateIp('172.20.0.5'), true, '172.16-31.x must be private');
  assert.strictEqual(isPrivateIp('169.254.169.254'), true, '169.254.x link-local metadata must be private');
  assert.strictEqual(isPrivateIp('::1'), true, 'IPv6 ::1 must be private');
  assert.strictEqual(isPrivateIp('8.8.8.8'), false, '8.8.8.8 must be public');
  assert.strictEqual(isPrivateIp('1.1.1.1'), false, '1.1.1.1 must be public');
  console.log('   ✅ isPrivateIp classifier accurately detects all private, loopback and cloud-metadata subnets');

  // 1.2 Host & URL validation
  const localhostCheck = validateUrlForSSRF('http://localhost:3000/internal');
  assert.strictEqual(localhostCheck.allowed, false, 'localhost must be blocked');

  const metadataCheck = validateUrlForSSRF('http://169.254.169.254/latest/meta-data');
  assert.strictEqual(metadataCheck.allowed, false, '169.254.169.254 must be blocked');

  const ftpCheck = validateUrlForSSRF('ftp://example.com/file.pdf');
  assert.strictEqual(ftpCheck.allowed, false, 'Non-http/https protocol must be blocked');

  const publicUrlCheck = validateUrlForSSRF('https://kaspi.kz/shop/p/laptop-123');
  assert.strictEqual(publicUrlCheck.allowed, true, 'Public HTTPS domain must be allowed');
  console.log('   ✅ validateUrlForSSRF blocks forbidden hostnames, protocols, and raw private IPs');

  // 1.3 DNS Resolution check
  const dnsLocalhost = await resolveAndValidateHost('localhost');
  assert.strictEqual(dnsLocalhost.allowed, false, 'DNS resolve for localhost must be blocked');
  console.log('   ✅ resolveAndValidateHost prevents DNS rebinding / internal host resolution');

  // =========================================================================
  // 2. Extractor Service Tests (File & Formats)
  // =========================================================================
  console.log('\n2️⃣ Testing ComplianceExtractorService (PDF, Text, Images)...');

  // 2.1 Plain text / PDF layer buffer
  const samplePdfText = 'Технические характеристики ноутбука:\n1. Процессор Intel Core i7 не менее 12 ядер.\n2. Оперативная память 16 ГБ DDR5.\n3. Накопитель SSD 512 ГБ NVMe.';
  const extractedTextDoc = await ComplianceExtractorService.extractFromFile(
    Buffer.from(samplePdfText, 'utf8'),
    'spec.txt'
  );
  assert.strictEqual(extractedTextDoc.sourceType, 'FILE');
  assert.ok(extractedTextDoc.text.includes('Intel Core i7'), 'Extracted text should contain specs');
  console.log('   ✅ Document text extraction extracts textual specifications cleanly');

  // 2.2 Image file detection for Multimodal OCR
  const fakeImageBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10]);
  const imageExtracted = await ComplianceExtractorService.extractFromFile(
    fakeImageBuffer,
    'photo_label.jpg',
    'image/jpeg'
  );
  assert.strictEqual(imageExtracted.isMultimodal, true, 'Images should be flagged as multimodal for Gemini Vision');
  assert.strictEqual(imageExtracted.imageMimeType, 'image/jpeg');
  console.log('   ✅ Image files are properly packaged for Gemini Multimodal Vision input');

  // =========================================================================
  // 3. Deterministic Verdict Calculation Tests (Section 4.3 of TZ)
  // =========================================================================
  console.log('\n3️⃣ Testing Deterministic Verdict Engine & Critical Veto Formula...');

  // 3.1 100% Match => COMPLIANT
  const fullMatchItems = [
    { requirementText: 'Процессор не менее 8 ядер', productValue: '12 ядер', status: 'MATCH', isCritical: true },
    { requirementText: 'ОЗУ не менее 16 ГБ', productValue: '32 ГБ', status: 'MATCH', isCritical: true },
    { requirementText: 'Цвет черный', productValue: 'Черный', status: 'MATCH', isCritical: false }
  ];
  const verdict1 = computeComplianceVerdict(fullMatchItems);
  assert.strictEqual(verdict1.compliancePercent, 100);
  assert.strictEqual(verdict1.verdict, 'COMPLIANT');
  console.log('   ✅ 100% matched items => COMPLIANT (100%)');

  // 3.2 90% Match, No Critical Failures => COMPLIANT
  const tenItems9Match = [
    ...Array(9).fill(0).map((_, i) => ({ requirementText: `Req ${i}`, productValue: `Val ${i}`, status: 'MATCH', isCritical: false })),
    { requirementText: 'Req 9', productValue: null, status: 'MISSING', isCritical: false }
  ];
  const verdict90 = computeComplianceVerdict(tenItems9Match);
  assert.strictEqual(verdict90.compliancePercent, 90);
  assert.strictEqual(verdict90.verdict, 'COMPLIANT');
  console.log('   ✅ 90% match without critical failures => COMPLIANT');

  // 3.3 80% Match, No Critical Failures => PARTIAL
  const tenItems8Match = [
    ...Array(8).fill(0).map((_, i) => ({ requirementText: `Req ${i}`, productValue: `Val ${i}`, status: 'MATCH', isCritical: false })),
    { requirementText: 'Req 8', productValue: null, status: 'MISSING', isCritical: false },
    { requirementText: 'Req 9', productValue: 'Wrong', status: 'MISMATCH', isCritical: false }
  ];
  const verdict80 = computeComplianceVerdict(tenItems8Match);
  assert.strictEqual(verdict80.compliancePercent, 80);
  assert.strictEqual(verdict80.verdict, 'PARTIAL');
  console.log('   ✅ 80% match without critical failures => PARTIAL');

  // 3.4 Critical Item MISMATCH => NOT_COMPLIANT (Critical VETO regardless of 90%+)
  const criticalMismatchItems = [
    ...Array(9).fill(0).map((_, i) => ({ requirementText: `Req ${i}`, productValue: `Val ${i}`, status: 'MATCH', isCritical: false })),
    { requirementText: 'Обязательное наличие сертификата СТ РК', productValue: 'Отсутствует', status: 'MISMATCH', isCritical: true }
  ];
  const verdictCritical = computeComplianceVerdict(criticalMismatchItems);
  assert.strictEqual(verdictCritical.compliancePercent, 90);
  assert.strictEqual(verdictCritical.verdict, 'NOT_COMPLIANT', 'Critical MISMATCH must veto the verdict to NOT_COMPLIANT');
  assert.strictEqual(verdictCritical.criticalMismatches.length, 1);
  console.log('   ✅ Critical MISMATCH applies immediate VETO => NOT_COMPLIANT (even at 90% general match)');

  // 3.5 Critical Item MISSING => NOT_COMPLIANT
  const criticalMissingItems = [
    ...Array(9).fill(0).map((_, i) => ({ requirementText: `Req ${i}`, productValue: `Val ${i}`, status: 'MATCH', isCritical: false })),
    { requirementText: 'Мощность двигателя не менее 150 кВт (обязательно)', productValue: null, status: 'MISSING', isCritical: true }
  ];
  const verdictCriticalMissing = computeComplianceVerdict(criticalMissingItems);
  assert.strictEqual(verdictCriticalMissing.verdict, 'NOT_COMPLIANT', 'Critical MISSING must veto the verdict to NOT_COMPLIANT');
  console.log('   ✅ Critical MISSING applies immediate VETO => NOT_COMPLIANT');

  // =========================================================================
  // 4. Heuristic Parser & Rule-based LLM Fallback Tests
  // =========================================================================
  console.log('\n4️⃣ Testing Heuristic Rule-Based Matching Engine...');

  const sampleTz = `
  Техническая спецификация:
  1. Ноутбук должен иметь процессор Intel Core i7 или эквивалент не менее 8 ядер.
  2. Обязательно наличие оперативной памяти не менее 16 ГБ DDR4/DDR5.
  3. Накопитель SSD объемом не менее 512 ГБ.
  4. Гарантийный срок обслуживания не менее 12 месяцев.
  `;

  const sampleProduct = `
  Ноутбук Lenovo ThinkPad E14
  Характеристики:
  - Процессор: Intel Core i7-1355U (10 ядер)
  - Оперативная память: 16 ГБ DDR5
  - Накопитель: 512 ГБ SSD NVMe
  - Гарантия: 12 месяцев официальной гарантии
  `;

  const heuristicResult = GeminiComplianceLlmProvider.runHeuristicMatching(sampleTz, sampleProduct);
  assert.ok(heuristicResult.items.length >= 3, 'Should extract at least 3 requirements');
  assert.strictEqual(heuristicResult.verdict, 'COMPLIANT');
  assert.ok(heuristicResult.compliancePercent >= 75);
  console.log(`   ✅ Heuristic matcher parsed ${heuristicResult.items.length} items with verdict: ${heuristicResult.verdict} (${heuristicResult.compliancePercent}%)`);

  // =========================================================================
  // 5. Content Hash & Deduplication Pipeline Tests
  // =========================================================================
  console.log('\n5️⃣ Testing Content Hash & Deduplication Logic...');

  const hash1 = ComplianceProcessorService.computeContentHash({
    tzText: 'Поставка серверов',
    sourceType: 'MANUAL_TEXT',
    sourceRaw: 'Сервер Dell PowerEdge',
    llmTier: 'FREE'
  });

  const hash2 = ComplianceProcessorService.computeContentHash({
    tzText: 'Поставка серверов',
    sourceType: 'MANUAL_TEXT',
    sourceRaw: 'Сервер Dell PowerEdge',
    llmTier: 'FREE'
  });

  const hashPaid = ComplianceProcessorService.computeContentHash({
    tzText: 'Поставка серверов',
    sourceType: 'MANUAL_TEXT',
    sourceRaw: 'Сервер Dell PowerEdge',
    llmTier: 'PAID'
  });

  assert.strictEqual(hash1, hash2, 'Identical requests must produce identical contentHash for deduplication');
  assert.notStrictEqual(hash1, hashPaid, 'Different LLM tier must produce distinct hash');
  console.log('   ✅ computeContentHash generates deterministic and tier-isolated cache hashes');

  // 5.2 Multi-Tenant Deduplication Isolation Test (Regression test for TZ-patch)
  console.log('\n  5.2 Testing Multi-Tenant Deduplication Isolation (companyProfileId Scoping)...');
  const { prisma } = require('../../src/lib/prisma');
  
  const sameContentHash = ComplianceProcessorService.computeContentHash({
    tzText: 'Процессор не менее 8 ядер',
    sourceType: 'MANUAL_TEXT',
    sourceRaw: 'Процессор 8 ядер, 16 ГБ ОЗУ',
    sourceFileUrl: null,
    fileBuffer: null,
    llmTier: 'FREE'
  });

  // Mock DB store for compliance checks
  const mockChecks = new Map();
  const mockItems = new Map();

  // Setup Company-A existing completed check with cached items
  mockChecks.set('check-A', {
    id: 'check-A',
    companyProfileId: 'company-A',
    status: 'DONE',
    contentHash: sameContentHash,
    productName: 'Товар Компании А',
    tzText: 'Процессор не менее 8 ядер',
    sourceType: 'MANUAL_TEXT',
    sourceRaw: 'Процессор 8 ядер, 16 ГБ ОЗУ',
    llmTier: 'FREE',
    verdict: 'COMPLIANT',
    compliancePercent: 100,
    items: [
      { id: 'item-A1', requirementText: 'Процессор 8 ядер', productValue: '8 ядер', status: 'MATCH', isCritical: true, comment: 'Company A Note' }
    ]
  });

  // Setup Company-B pending check with identical contentHash
  mockChecks.set('check-B', {
    id: 'check-B',
    companyProfileId: 'company-B',
    status: 'PENDING',
    contentHash: sameContentHash,
    productName: 'Товар Компании Б',
    tzText: 'Процессор не менее 8 ядер',
    sourceType: 'MANUAL_TEXT',
    sourceRaw: 'Процессор 8 ядер, 16 ГБ ОЗУ',
    llmTier: 'FREE',
    items: []
  });

  // Setup Company-A2 pending check with identical contentHash (intra-tenant deduplication)
  mockChecks.set('check-A2', {
    id: 'check-A2',
    companyProfileId: 'company-A',
    status: 'PENDING',
    contentHash: sameContentHash,
    productName: 'Товар Компании А (Повтор)',
    tzText: 'Процессор не менее 8 ядер',
    sourceType: 'MANUAL_TEXT',
    sourceRaw: 'Процессор 8 ядер, 16 ГБ ОЗУ',
    llmTier: 'FREE',
    items: []
  });

  const origFindUnique = prisma.complianceCheck.findUnique;
  const origFindFirst = prisma.complianceCheck.findFirst;
  const origUpdate = prisma.complianceCheck.update;
  const origDeleteMany = prisma.complianceCheckItem?.deleteMany;
  const origCreateMany = prisma.complianceCheckItem?.createMany;
  const origCreate = prisma.complianceCheckItem?.create;

  let llmCalls = 0;
  const mockLlmProvider = {
    async runComplianceCheck(params) {
      llmCalls++;
      return {
        productName: 'Свежий анализ LLM',
        verdict: 'COMPLIANT',
        compliancePercent: 100,
        items: [
          { requirement: 'Процессор 8 ядер', productValue: '8 ядер', status: 'MATCH', isCritical: true, comment: 'Fresh LLM analysis' }
        ]
      };
    }
  };

  prisma.complianceCheck.findUnique = async ({ where }) => mockChecks.get(where.id) || null;
  prisma.complianceCheck.findFirst = async ({ where, include }) => {
    for (const c of mockChecks.values()) {
      if (where.contentHash && c.contentHash !== where.contentHash) continue;
      if (where.companyProfileId && c.companyProfileId !== where.companyProfileId) continue;
      if (where.status && c.status !== where.status) continue;
      if (where.id?.not && c.id === where.id.not) continue;
      return { ...c, items: mockItems.get(c.id) || c.items || [] };
    }
    return null;
  };
  prisma.complianceCheck.update = async ({ where, data }) => {
    const existing = mockChecks.get(where.id) || {};
    const updated = { ...existing, ...data };
    mockChecks.set(where.id, updated);
    return { ...updated, items: mockItems.get(where.id) || [] };
  };
  if (!prisma.complianceCheckItem) prisma.complianceCheckItem = {};
  prisma.complianceCheckItem.deleteMany = async ({ where }) => {
    mockItems.set(where.checkId, []);
    return { count: 1 };
  };
  prisma.complianceCheckItem.createMany = async ({ data }) => {
    for (const item of data) {
      const arr = mockItems.get(item.checkId) || [];
      arr.push({ id: `item_${Date.now()}_${Math.random()}`, ...item });
      mockItems.set(item.checkId, arr);
    }
    return { count: data.length };
  };
  prisma.complianceCheckItem.create = async ({ data }) => {
    const arr = mockItems.get(data.checkId) || [];
    const created = { id: `item_${Date.now()}_${Math.random()}`, ...data };
    arr.push(created);
    mockItems.set(data.checkId, arr);
    return created;
  };

  try {
    // Process Check B (Different tenant 'company-B')
    const resB = await ComplianceProcessorService.processComplianceCheck('check-B', undefined, mockLlmProvider);
    assert.strictEqual(llmCalls, 1, 'Different companyProfileId must NOT use Company-A cache and must invoke LLM');
    assert.strictEqual(resB.companyProfileId, 'company-B');
    console.log('     ✅ Different tenant (company-B) did NOT reuse company-A cache and ran fresh analysis');

    // Process Check A2 (Same tenant 'company-A')
    const resA2 = await ComplianceProcessorService.processComplianceCheck('check-A2', undefined, mockLlmProvider);
    assert.strictEqual(llmCalls, 1, 'Same companyProfileId MUST reuse Company-A cache without calling LLM again');
    assert.strictEqual(resA2.companyProfileId, 'company-A');
    console.log('     ✅ Same tenant (company-A) successfully reused internal deduplication cache without extra LLM call');
  } finally {
    prisma.complianceCheck.findUnique = origFindUnique;
    prisma.complianceCheck.findFirst = origFindFirst;
    prisma.complianceCheck.update = origUpdate;
    if (origDeleteMany) prisma.complianceCheckItem.deleteMany = origDeleteMany;
    if (origCreateMany) prisma.complianceCheckItem.createMany = origCreateMany;
    if (origCreate) prisma.complianceCheckItem.create = origCreate;
  }

  // =========================================================================
  // 6. REST API Route Auth & Multi-Tenant Isolation Tests
  // =========================================================================
  console.log('\n6️⃣ Testing REST API Route Handlers Auth & IDOR Protection...');

  const { POST: postCheck, GET: listChecks } = require('../../src/app/api/compliance-check/route');
  const { GET: getCheckById, DELETE: deleteCheckById } = require('../../src/app/api/compliance-check/[id]/route');

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

  const origNodeEnv = process.env.NODE_ENV;
  const origAllowDemo = process.env.ALLOW_DEMO_AUTH;
  const origAuthStore = process.env.AUTH_STORE_MODE;

  try {
    process.env.NODE_ENV = 'production';
    delete process.env.ALLOW_DEMO_AUTH;
    delete process.env.AUTH_STORE_MODE;

    // 6.1 Unauthenticated POST
    const reqPostUnauth = createMockReq('http://localhost/api/compliance-check', {
      body: { tzText: 'ТЗ', sourceType: 'MANUAL_TEXT', sourceRaw: 'Товар' }
    });
    const resPostUnauth = await postCheck(reqPostUnauth);
    assert.strictEqual(resPostUnauth.status, 401, 'POST /api/compliance-check must return 401 when unauthenticated');
    console.log('   ✅ POST /api/compliance-check correctly rejects unauthenticated requests (401)');

    // 6.2 Unauthenticated GET list
    const reqListUnauth = createMockReq('http://localhost/api/compliance-check');
    const resListUnauth = await listChecks(reqListUnauth);
    assert.strictEqual(resListUnauth.status, 401, 'GET /api/compliance-check must return 401 when unauthenticated');
    console.log('   ✅ GET /api/compliance-check correctly rejects unauthenticated requests (401)');

    // 6.3 Unauthenticated GET by ID
    const reqGetIdUnauth = createMockReq('http://localhost/api/compliance-check/check-123');
    const resGetIdUnauth = await getCheckById(reqGetIdUnauth, { params: { id: 'check-123' } });
    assert.strictEqual(resGetIdUnauth.status, 401, 'GET /api/compliance-check/:id must return 401 when unauthenticated');
    console.log('   ✅ GET /api/compliance-check/:id correctly rejects unauthenticated requests (401)');

    // 6.4 Unauthenticated DELETE by ID
    const reqDeleteIdUnauth = createMockReq('http://localhost/api/compliance-check/check-123');
    const resDeleteIdUnauth = await deleteCheckById(reqDeleteIdUnauth, { params: { id: 'check-123' } });
    assert.strictEqual(resDeleteIdUnauth.status, 401, 'DELETE /api/compliance-check/:id must return 401 when unauthenticated');
    console.log('   ✅ DELETE /api/compliance-check/:id correctly rejects unauthenticated requests (401)');
  } finally {
    process.env.NODE_ENV = origNodeEnv;
    if (origAllowDemo) process.env.ALLOW_DEMO_AUTH = origAllowDemo;
    if (origAuthStore) process.env.AUTH_STORE_MODE = origAuthStore;
  }

  console.log('\n🎉 ALL COMPLIANCE CHECKER AUTOMATED TESTS PASSED SUCCESSFULLY!\n');
  process.exit(0);
}

runComplianceCheckerTests().catch(err => {
  console.error('\n💥 Compliance Checker Test Failed:', err);
  process.exit(1);
});
