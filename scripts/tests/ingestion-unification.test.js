require('tsx/cjs');
const assert = require('assert');
const { GoszakupApiAdapter } = require('../../src/lib/ingestion/goszakup.adapter');
const { SamrukApiAdapter } = require('../../src/lib/ingestion/samruk.adapter');
const { IngestionProcessorService } = require('../../src/lib/services/ingestion-processor.service');

async function runTests() {
  console.log('🧪 [Test Suite] Testing Ingestion Unification & Real API Document Mapping (Tasks 2.1 & 2.6)...');

  // 1. Verify GoszakupApiAdapter maps document files
  const goszakupAdapter = new GoszakupApiAdapter();
  const gosRaw = [
    {
      id: 777100,
      number_anno: '777100-2026',
      name_ru: 'Тестовая закупка графических рабочих станций',
      customer_name_ru: 'Министерство цифрового развития РК',
      customer_bin: '010140001111',
      total_sum: 50000000,
      region_ru: 'г. Астана',
      publish_date: '2026-07-25T10:00:00Z',
      end_date: '2026-08-10T18:00:00Z',
      security_sum: 1500000,
      files: [
        { name: 'ТЗ_Рабочие_станции.pdf', path: '/docs/tz_software.pdf', size: '2.5 MB' }
      ]
    }
  ];
  const gosNormalized = goszakupAdapter.normalize(gosRaw);
  assert.ok(Array.isArray(gosNormalized[0].documents) && gosNormalized[0].documents.length > 0, 'Goszakup normalized tender must contain documents');
  assert.strictEqual(gosNormalized[0].documents[0].fileUrl, '/docs/tz_software.pdf');
  console.log('  ✅ GoszakupApiAdapter correctly maps document files to TenderDocument objects');

  // 2. Verify SamrukApiAdapter maps document files
  const samrukAdapter = new SamrukApiAdapter();
  const samrukRaw = [
    {
      advertId: 888200,
      advertNumber: 'SK-2026-888200',
      titleRu: 'Поставка спецодежды для энергетиков',
      organizerRu: 'АО "Самрук-Энерго"',
      organizerBin: '070240005555',
      sum: 25000000,
      regionNameRu: 'Алматинская область',
      publishDate: '2026-07-25T12:00:00Z',
      endDate: '2026-08-12T18:00:00Z',
      guaranteeAmount: 250000,
      files: [
        { name: 'Требования_к_одежде.pdf', url: '/docs/fleet_req.pdf', size: '1.8 MB' }
      ]
    }
  ];
  const samrukNormalized = samrukAdapter.normalize(samrukRaw);
  assert.ok(Array.isArray(samrukNormalized[0].documents) && samrukNormalized[0].documents.length > 0, 'Samruk normalized tender must contain documents');
  assert.strictEqual(samrukNormalized[0].documents[0].fileUrl, '/docs/fleet_req.pdf');
  console.log('  ✅ SamrukApiAdapter correctly maps document files to TenderDocument objects');

  // 3. Verify IngestionProcessorService.processIngestedTenders processes documents and sets extractedText
  const sampleTenders = [gosNormalized[0]];
  const processed = await IngestionProcessorService.processIngestedTenders(sampleTenders);
  assert.ok(Array.isArray(processed), 'processIngestedTenders must return array of processed tenders');
  assert.ok(sampleTenders[0].documents[0].extractedText, 'processIngestedTenders must extract and attach text to documents');
  assert.ok(sampleTenders[0].documents[0].extractedText.includes('СПЕЦИФИКАЦИЯ') || sampleTenders[0].documents[0].extractedText.includes('ПО'), 'Extracted document text must contain specification content');
  console.log('  ✅ IngestionProcessorService unifies extraction & processing across manual and worker flows');

  console.log('🎉 Ingestion Unification & Document Mapping Test Suite completed successfully!');
}

runTests().catch(err => {
  console.error('💥 Test suite failed:', err);
  process.exit(1);
});
