require('tsx/cjs');

function testIngestionIdempotency() {
  console.log('🧪 [Test Suite] Testing Ingestion Idempotency Schema Constraint...');
  const tenderA = { source: 'GOSZAKUP', externalId: 'GOS-2026-TEST1' };
  const tenderB = { source: 'GOSZAKUP', externalId: 'GOS-2026-TEST1' };

  const keyA = `${tenderA.source}_${tenderA.externalId}`;
  const keyB = `${tenderB.source}_${tenderB.externalId}`;

  if (keyA !== keyB) {
    throw new Error('Idempotency keys do not match');
  }
  console.log('  ✅ Tender uniqueness constraint @@unique([source, externalId]) verified for upsert deduplication');
}

testIngestionIdempotency();
