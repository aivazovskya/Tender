require('tsx/cjs');
const assert = require('assert');
const { diffTenderFields } = require('../../src/lib/ingestion/diff');
const { ConfigurableScraperAdapter } = require('../../src/lib/ingestion/scraper.adapter');
const { GoszakupApiAdapter } = require('../../src/lib/ingestion/goszakup.adapter');
const { SamrukApiAdapter } = require('../../src/lib/ingestion/samruk.adapter');

console.log('🧪 [Test Suite] Testing Ingestion Module Bug Fixes (Bugs #1, #2, #3)...');

// --- Test Bug #1: Scraper Source Uniqueness ---
const configSourceA = {
  dataSourceId: 'SOURCE_ALPHA',
  renderMode: 'STATIC',
  listUrlTemplate: 'https://example-a.com/tenders',
  pagination: { startPage: 1, maxPages: 1 },
  listItemSelector: '.item',
  fields: { title: { selector: '.title' } }
};

const configSourceB = {
  dataSourceId: 'SOURCE_BETA',
  renderMode: 'STATIC',
  listUrlTemplate: 'https://example-b.com/tenders',
  pagination: { startPage: 1, maxPages: 1 },
  listItemSelector: '.item',
  fields: { title: { selector: '.title' } }
};

const adapterA = new ConfigurableScraperAdapter(configSourceA);
const adapterB = new ConfigurableScraperAdapter(configSourceB);

const normA = adapterA.normalize([{ externalId: 'LOT-100', title: 'Tender from Alpha' }]);
const normB = adapterB.normalize([{ externalId: 'LOT-100', title: 'Tender from Beta' }]);

assert.strictEqual(normA[0].source, 'SCRAPER:SOURCE_ALPHA');
assert.strictEqual(normB[0].source, 'SCRAPER:SOURCE_BETA');
assert.notStrictEqual(normA[0].source, normB[0].source, 'Different scraper sources must have distinct source tags');
console.log('  ✅ Bug #1: Scraper sourceType is dynamic and scoped per dataSourceId');


// --- Test Bug #2: TenderAuditTrail Diff Function ---
const oldTender = {
  title: 'Old Tender Title',
  amount: 1000000,
  deadlineDate: new Date('2026-08-01T10:00:00Z'),
  status: 'ACTIVE',
  region: 'г. Астана'
};

const newTenderWithChanges = {
  title: 'Updated Tender Title',
  amount: 1500000,
  deadlineDate: new Date('2026-08-01T10:00:00Z'), // unchanged
  status: 'ACTIVE', // unchanged
  region: 'г. Алматы' // changed
};

const deltas = diffTenderFields(oldTender, newTenderWithChanges);
assert.strictEqual(deltas.length, 3, 'Should detect exactly 3 changed fields');

const titleChange = deltas.find(d => d.field === 'title');
assert.ok(titleChange);
assert.strictEqual(titleChange.oldValue, 'Old Tender Title');
assert.strictEqual(titleChange.newValue, 'Updated Tender Title');

const amountChange = deltas.find(d => d.field === 'amount');
assert.ok(amountChange);
assert.strictEqual(amountChange.oldValue, '1000000');
assert.strictEqual(amountChange.newValue, '1500000');

const noChanges = diffTenderFields(oldTender, oldTender);
assert.strictEqual(noChanges.length, 0, 'No deltas should be returned for identical tender');

console.log('  ✅ Bug #2: diffTenderFields computes exact deltas and ignores unchanged fields');


// --- Test Bug #3: Fallback Status & Health Reporting ---
async function testFallbackStatus() {
  delete process.env.GOSZAKUP_API_TOKEN;
  delete process.env.SAMRUK_API_TOKEN;

  const goszakupAdapter = new GoszakupApiAdapter();
  const gosResult = await goszakupAdapter.run();
  assert.strictEqual(gosResult.usedFallbackData, true, 'Goszakup adapter should flag usedFallbackData = true when token is missing');
  assert.strictEqual(gosResult.status, 'WARN', 'Goszakup adapter status should be WARN when fallback data is used');

  const samrukAdapter = new SamrukApiAdapter();
  const samrukResult = await samrukAdapter.run();
  assert.strictEqual(samrukResult.usedFallbackData, true, 'Samruk adapter should flag usedFallbackData = true when token is missing');
  assert.strictEqual(samrukResult.status, 'WARN', 'Samruk adapter status should be WARN when fallback data is used');

  console.log('  ✅ Bug #3: Fallback demo data sets usedFallbackData=true and status=WARN');
}

testFallbackStatus().then(() => {
  console.log('🎉 Ingestion Bug Fixes Test Suite completed successfully!');
}).catch(err => {
  console.error('💥 Test suite failed:', err);
  process.exit(1);
});
