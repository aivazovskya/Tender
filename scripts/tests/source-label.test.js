require('tsx/cjs');
const assert = require('assert');
const { getSourceLabel, getShortSourceBadge } = require('../../src/lib/utils/sourceLabel');

console.log('🧪 [Test Suite] Testing UI Source Label Helper (Bug #4)...');

const mockDataSources = [
  { id: 'ds-b2b-center', name: 'B2B_CENTER', displayName: 'B2B-Center РК' },
  { id: 'ds-eetp', name: 'EETP_KZ', displayName: 'ЕЭТП Казахстан' }
];

// Test standard static sources
assert.strictEqual(getSourceLabel('GOSZAKUP'), 'goszakup.gov.kz');
assert.strictEqual(getSourceLabel('SAMRUK_KAZYNA'), 'portal.sk.kz');
assert.strictEqual(getSourceLabel('KAZATMROPROM'), 'kazatomprom.kz');

// Test short badges for standard sources
assert.strictEqual(getShortSourceBadge('GOSZAKUP'), 'ГОС');
assert.strictEqual(getShortSourceBadge('SAMRUK_KAZYNA'), 'СК');
assert.strictEqual(getShortSourceBadge('KAZATMROPROM'), 'КАП');

// Test dynamic scraper sources with matching DataSources metadata
assert.strictEqual(getSourceLabel('SCRAPER:ds-b2b-center', mockDataSources), 'B2B-Center РК');
assert.strictEqual(getSourceLabel('SCRAPER:ds-eetp', mockDataSources), 'ЕЭТП Казахстан');
assert.strictEqual(getShortSourceBadge('SCRAPER:ds-b2b-center', mockDataSources), 'BР');

// Test dynamic scraper sources without metadata fallback
assert.strictEqual(getSourceLabel('SCRAPER:CustomMarketplace'), 'CustomMarketplace');
assert.strictEqual(getShortSourceBadge('SCRAPER:CustomMarketplace'), 'B2B');

console.log('  ✅ getSourceLabel returns exact displayName for SCRAPER:<id> sources');
console.log('  ✅ getShortSourceBadge generates short badges dynamically for Kanban cards');
console.log('🎉 Source Label Test Suite completed successfully!');
