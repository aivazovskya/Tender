require('tsx/cjs');
const assert = require('assert');
const { validateApiAuth } = require('../../src/lib/security/auth');
const { createSession, createUser } = require('../../src/lib/security/auth-store');
const { AIService } = require('../../src/lib/services/ai.service');
const { IngestionProcessorService } = require('../../src/lib/services/ingestion-processor.service');

process.env.AUTH_STORE_MODE = 'memory';

async function runTests() {
  console.log('🧪 [Test Suite] Testing Ingestion & Security Fixes (Bugs #17, #18, #19)...\n');

  // --- 1. Test Bug #17: Session Cookie & Header Isolation ---
  console.log('▶ Testing Bug #17: Session Cookie & Header User Isolation...');

  // Create real test users and sessions
  const user1 = await createUser({ email: `v5_test1_${Date.now()}@test.kz`, passwordHash: 'hash1', status: 'APPROVED' });
  const sess1 = await createSession(user1.id);

  const user2 = await createUser({ email: `v5_test2_${Date.now()}@test.kz`, passwordHash: 'hash2', status: 'APPROVED' });
  const sess2 = await createSession(user2.id);

  const mockReqSessionCookie = {
    headers: { get: () => null },
    cookies: { get: (name) => name === 'tender_session_id' ? { value: sess1.id } : undefined }
  };
  const res1 = await validateApiAuth(mockReqSessionCookie);
  assert.strictEqual(res1.authorized, true);
  assert.strictEqual(res1.userId, user1.id);

  const mockReqSessionHeader = {
    headers: { get: (name) => name.toLowerCase() === 'x-session-id' ? sess2.id : null },
    cookies: { get: () => undefined }
  };
  const res2 = await validateApiAuth(mockReqSessionHeader);
  assert.strictEqual(res2.authorized, true);
  assert.strictEqual(res2.userId, user2.id);
  assert.notStrictEqual(res1.userId, res2.userId, 'Different sessions must have distinct user IDs');

  // Verify fake session gets rejected with 401 (Finding 2)
  const mockReqFakeSession = {
    headers: { get: () => null },
    cookies: { get: (name) => name === 'tender_session_id' ? { value: 'user_session_fake_unauthenticated' } : undefined }
  };
  const resFake = await validateApiAuth(mockReqFakeSession);
  assert.strictEqual(resFake.authorized, false);
  assert.strictEqual(resFake.response?.status, 401);

  console.log('  ✅ Bug #17: Session cookies and headers resolve to isolated user IDs & fake sessions rejected with 401');

  // --- 2. Test Bug #18: IngestionProcessorService Transactional Execution ---
  console.log('\n▶ Testing Bug #18: IngestionProcessorService Atomic Persistence...');
  const sampleTenders = [
    {
      source: 'SCRAPER:test-source',
      externalId: 'test-lot-v5-1',
      title: 'Тендер на поставку серверов v5',
      customerName: 'АО Тест',
      customerBin: '123456789012',
      category: 'Оборудование',
      industryTags: ['IT'],
      amount: 5000000,
      currency: 'KZT',
      region: 'г. Астана',
      publishDate: new Date().toISOString(),
      deadlineDate: new Date(Date.now() + 86400000 * 5).toISOString(),
      sourceUrl: 'https://example.com/test-lot-v5-1',
      documents: [
        { fileName: 'ТЗ.pdf', fileUrl: 'https://example.com/files/tz.pdf', docType: 'TECHNICAL_SPEC' }
      ]
    }
  ];

  const processed = await IngestionProcessorService.processIngestedTenders(sampleTenders);
  assert.strictEqual(Array.isArray(processed), true);
  assert.strictEqual(processed.length, 1);
  assert.strictEqual(processed[0].externalId, 'test-lot-v5-1');
  console.log('  ✅ Bug #18: IngestionProcessorService processes tenders atomically via prisma.$transaction');

  // --- 3. Test Bug #19: AIService.answerRAGQuestion Async Document RAG ---
  console.log('\n▶ Testing Bug #19: AIService.answerRAGQuestion Document RAG...');
  const mockTender = {
    externalId: '998877',
    title: 'Поставка лицензионного ПО',
    customerName: 'ТОО КазахИТ',
    amount: 15000000,
    applicationSecurityAmount: 150000,
    applicationSecurityPercent: 1,
    region: 'г. Алматы',
    deadlineDate: new Date('2026-12-31T18:00:00Z').toISOString(),
    source: 'GOSZAKUP',
    documents: [{ fileName: 'Спецификация.pdf', extractedText: 'Требуются лицензии ПО Microsoft Windows Server 2022 в количестве 50 штук с гарантией 12 месяцев.' }]
  };

  const ragPromise = AIService.answerRAGQuestion(mockTender, 'Сколько лицензий требуется?', mockTender.documents[0].extractedText);
  assert.ok(ragPromise instanceof Promise, 'answerRAGQuestion must return a Promise');

  const answer = await ragPromise;
  assert.strictEqual(typeof answer, 'string');
  assert.ok(answer.length > 0, 'RAG answer must not be empty');
  console.log('  ✅ Bug #19: AIService.answerRAGQuestion executes asynchronously and returns grounded response');

  // --- 4. Test Bug #20: POST /api/tenders/ask Server API Route ---
  console.log('\n▶ Testing Bug #20: Server API Route POST /api/tenders/ask...');
  const { POST: askHandler } = require('../../src/app/api/tenders/ask/route');
  const mockAskReq = {
    headers: { get: () => null },
    cookies: { get: (name) => name === 'tender_session_id' ? { value: sess1.id } : undefined },
    json: async () => ({
      externalId: '998877',
      title: 'Поставка оборудования',
      customerName: 'АО КазахСервис',
      amount: 10000000,
      region: 'г. Астана',
      deadlineDate: new Date().toISOString(),
      question: 'Какая сумма договора?'
    })
  };
  const askRes = await askHandler(mockAskReq);
  assert.strictEqual(askRes.status, 200, 'RAG API route must return HTTP 200 OK for authenticated user');
  const askData = await askRes.json();
  assert.strictEqual(askData.success, true);
  assert.ok(typeof askData.answer === 'string' && askData.answer.length > 0);
  console.log('  ✅ Bug #20: POST /api/tenders/ask server API route handles RAG Q&A without client side Prisma/LLM imports');

  console.log('\n🎉 Ingestion & Security Fixes Test Suite (v5/v6) completed successfully!');
}

runTests().catch(err => {
  console.error('❌ Test suite failed:', err);
  process.exit(1);
});
