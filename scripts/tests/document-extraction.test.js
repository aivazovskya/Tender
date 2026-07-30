require('tsx/cjs');
const assert = require('assert');
const { DocumentExtractionService } = require('../../src/lib/services/document-extraction.service');

async function runTests() {
  console.log('🧪 [Test Suite] Testing DocumentExtractionService & SSRF protection (Task 2)...');

  // 1. SSRF Protection: Private / loopback IP URLs must be blocked
  const ssrfResult1 = await DocumentExtractionService.extractTextFromDocumentUrl('http://127.0.0.1/tz.pdf');
  assert.strictEqual(ssrfResult1, null, 'SSRF protection must block loopback IPv4 http://127.0.0.1');

  const ssrfResult2 = await DocumentExtractionService.extractTextFromDocumentUrl('http://169.254.169.254/latest/meta-data');
  assert.strictEqual(ssrfResult2, null, 'SSRF protection must block cloud metadata IP http://169.254.169.254');
  console.log('  ✅ SSRF protection correctly blocks internal IP URLs');

  // 2. Local demo specification files (/docs/tz_software.pdf)
  const localDemoText = await DocumentExtractionService.extractTextFromDocumentUrl('/docs/tz_software.pdf');
  assert.ok(typeof localDemoText === 'string' && localDemoText.length > 50, 'Local demo document must return non-empty text string');
  assert.ok(localDemoText.includes('ТЕХНИЧЕСКАЯ СПЕЦИФИКАЦИЯ') || localDemoText.includes('Лицензии'), 'Demo document text must contain specification keywords');
  console.log('  ✅ Local demo document /docs/tz_software.pdf extracted successfully');

  // 3. Unreachable host / network error handling (must not throw or crash worker)
  const networkErrResult = await DocumentExtractionService.extractTextFromDocumentUrl('https://non-existent-domain-123456789.invalid/spec.pdf');
  assert.strictEqual(networkErrResult, null, 'Network error or invalid domain must return null gracefully');
  console.log('  ✅ Network failure handled gracefully without crashing');

  console.log('🎉 DocumentExtractionService Test Suite completed successfully!');
}

runTests().catch(err => {
  console.error('💥 DocumentExtractionService Test Suite Failed:', err);
  process.exit(1);
});
