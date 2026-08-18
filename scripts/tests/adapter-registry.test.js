require('tsx/cjs');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { 
  getApiAdapter, 
  listRegisteredApiSources, 
  registerApiAdapter, 
  unregisterApiAdapter 
} = require('../../src/lib/ingestion/adapter-registry');
const { BaseTenderAdapter } = require('../../src/lib/ingestion/base.adapter');
const { GoszakupApiAdapter } = require('../../src/lib/ingestion/goszakup.adapter');
const { SamrukApiAdapter } = require('../../src/lib/ingestion/samruk.adapter');

console.log('🧪 [Test Suite] Testing Ingestion Adapter Registry (Task / ТЗ API Registry)...\n');

// 1. Verify standard registered sources
const sources = listRegisteredApiSources();
assert(sources.includes('GOSZAKUP'), 'Registry must include GOSZAKUP');
assert(sources.includes('SAMRUK_KAZYNA'), 'Registry must include SAMRUK_KAZYNA');
console.log(`✔ Registered API sources listed successfully: ${sources.join(', ')}`);

// 2. Verify getApiAdapter factory returns correct instances
const goszakupAdapter = getApiAdapter('GOSZAKUP');
assert(goszakupAdapter instanceof GoszakupApiAdapter, 'getApiAdapter("GOSZAKUP") must return instance of GoszakupApiAdapter');
assert(goszakupAdapter instanceof BaseTenderAdapter, 'Adapter must inherit from BaseTenderAdapter');

const samrukAdapter = getApiAdapter('SAMRUK_KAZYNA');
assert(samrukAdapter instanceof SamrukApiAdapter, 'getApiAdapter("SAMRUK_KAZYNA") must return instance of SamrukApiAdapter');

const invalidAdapter = getApiAdapter('NON_EXISTENT_SOURCE');
assert.strictEqual(invalidAdapter, null, 'getApiAdapter for un-registered source must return null');
console.log('✔ getApiAdapter factory instantiates correct adapter instances & handles unknown sources gracefully!');

// 3. Test adding a third custom adapter dynamically without touching ingestion/route.ts
class TestDummyApiAdapter extends BaseTenderAdapter {
  sourceType = 'TEST_SOURCE';
  adapterType = 'API';

  async fetchRawData() {
    return [{ id: 'raw-1', title: 'Test Tender' }];
  }

  normalize(rawData) {
    return rawData.map(r => ({
      id: r.id,
      source: 'TEST_SOURCE',
      externalId: 'ext-100',
      title: r.title,
      customerName: 'Test Customer',
      customerBin: '123456789012',
      category: 'ИТ',
      industryTags: [],
      procurementMethod: 'OPEN_TENDER',
      amount: 100000,
      currency: 'KZT',
      region: 'г. Астана',
      publishDate: new Date().toISOString(),
      deadlineDate: new Date().toISOString(),
      status: 'ACTIVE',
      sourceUrl: 'https://test.kz',
      riskScore: 10,
      riskFlags: [],
      documents: [],
      history: []
    }));
  }
}

const { processIngestionJob } = require('../../src/lib/queue/ingestion.queue');

// Register dynamic test source
registerApiAdapter('TEST_SOURCE', TestDummyApiAdapter);

const testAdapterInstance = getApiAdapter('TEST_SOURCE');
assert(testAdapterInstance instanceof TestDummyApiAdapter, 'getApiAdapter("TEST_SOURCE") must return instance of TestDummyApiAdapter');
assert(listRegisteredApiSources().includes('TEST_SOURCE'), 'listRegisteredApiSources must include newly registered TEST_SOURCE');

// Run dummy adapter ingestion pipeline & background job handler
(async () => {
  const res = await testAdapterInstance.run();
  assert.strictEqual(res.status, 'SUCCESS');
  assert.strictEqual(res.itemsNormalized, 1);
  assert.strictEqual(res.tenders[0].title, 'Test Tender');
  console.log('✔ Adding a 3rd custom API adapter via adapter-registry works seamlessly without route modification!');

  // Test background queue job execution for dynamic 3rd adapter via processIngestionJob
  const queueRes = await processIngestionJob({ source: 'TEST_SOURCE' });
  assert.strictEqual(queueRes.status, 'SUCCESS');
  assert.strictEqual(queueRes.itemsNormalized, 1);
  assert.strictEqual(queueRes.tenders[0].title, 'Test Tender');
  console.log('✔ Background BullMQ worker (processIngestionJob) successfully executes dynamic 3rd adapter via registry!');

  // Cleanup test adapter
  unregisterApiAdapter('TEST_SOURCE');
  assert.strictEqual(getApiAdapter('TEST_SOURCE'), null);
  assert(!listRegisteredApiSources().includes('TEST_SOURCE'));

  // 4. Verify ingestion/route.ts contains no hardcoded source === 'GOSZAKUP' logic
  const routeContent = fs.readFileSync(path.join(__dirname, '../../src/app/api/ingestion/route.ts'), 'utf8');
  assert(!routeContent.includes("source === 'GOSZAKUP'"), "ingestion/route.ts must not contain hardcoded `source === 'GOSZAKUP'`");
  assert(!routeContent.includes("source === 'SAMRUK_KAZYNA'"), "ingestion/route.ts must not contain hardcoded `source === 'SAMRUK_KAZYNA'`");
  assert(routeContent.includes('getApiAdapter(source)'), 'ingestion/route.ts must use getApiAdapter(source) registry lookup');
  console.log('✔ ingestion/route.ts verified: hardcoded if/else chain eliminated in favor of getApiAdapter(source)!');

  // 5. Verify ingestion.queue.ts contains no hardcoded source === 'GOSZAKUP' logic
  const queueContent = fs.readFileSync(path.join(__dirname, '../../src/lib/queue/ingestion.queue.ts'), 'utf8');
  assert(!queueContent.includes("source === 'GOSZAKUP'"), "ingestion.queue.ts must not contain hardcoded `source === 'GOSZAKUP'`");
  assert(!queueContent.includes("source === 'SAMRUK_KAZYNA'"), "ingestion.queue.ts must not contain hardcoded `source === 'SAMRUK_KAZYNA'`");
  assert(queueContent.includes('getApiAdapter(source)'), 'ingestion.queue.ts must use getApiAdapter(source) registry lookup');
  assert(queueContent.includes("source === 'CHECK_SLA'"), "ingestion.queue.ts must retain CHECK_SLA job handling");
  assert(queueContent.includes("source === 'CHECK_MATCHES'"), "ingestion.queue.ts must retain CHECK_MATCHES job handling");
  console.log('✔ ingestion.queue.ts verified: hardcoded if/else chain eliminated, uses getApiAdapter(source), SLA/MATCHES jobs preserved!');

  console.log('\n🎉 Ingestion Adapter Registry Test Suite completed successfully!');
  process.exit(0);
})().catch(err => {
  console.error('💥 Test execution error:', err);
  process.exit(1);
});
