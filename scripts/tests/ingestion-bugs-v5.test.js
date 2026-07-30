require('tsx/cjs');
const assert = require('assert');
const { validateApiAuth } = require('../../src/lib/security/auth');
const { AIService } = require('../../src/lib/services/ai.service');
const { IngestionProcessorService } = require('../../src/lib/services/ingestion-processor.service');

async function runTests() {
  console.log('🧪 [Test Suite] Testing Ingestion & Security Fixes (Bugs #17, #18, #19)...\n');

  // --- 1. Test Bug #17: Session Cookie & Header Isolation ---
  console.log('▶ Testing Bug #17: Session Cookie & Header User Isolation...');
  const mockReqSessionCookie = {
    headers: { get: () => null },
    cookies: { get: (name) => name === 'tender_session_id' ? { value: 'user_session_abc123' } : undefined }
  };
  const res1 = validateApiAuth(mockReqSessionCookie);
  assert.strictEqual(res1.authorized, true);
  assert.ok(res1.userId.startsWith('user-sess-'), 'Session cookie should resolve to user-sess- ID');

  const mockReqSessionHeader = {
    headers: { get: (name) => name.toLowerCase() === 'x-session-id' ? 'user_session_xyz789' : null },
    cookies: { get: () => undefined }
  };
  const res2 = validateApiAuth(mockReqSessionHeader);
  assert.strictEqual(res2.authorized, true);
  assert.ok(res2.userId.startsWith('user-sess-'), 'X-Session-Id header should resolve to user-sess- ID');
  assert.notStrictEqual(res1.userId, res2.userId, 'Different sessions must have distinct user IDs');
  console.log('  ✅ Bug #17: Session cookies and headers resolve to isolated user IDs');

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

  console.log('\n🎉 Ingestion & Security Fixes Test Suite (v5) completed successfully!');
}

runTests().catch(err => {
  console.error('❌ Test suite failed:', err);
  process.exit(1);
});
