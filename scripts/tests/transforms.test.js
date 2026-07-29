require('tsx/cjs');
const { TransformRegistry } = require('../../src/lib/ingestion/transforms');

function testTransforms() {
  console.log('🧪 [Test Suite] Testing TransformRegistry...');
  let passed = 0;
  let total = 0;

  function assert(cond, name) {
    total++;
    if (cond) {
      console.log(`  ✅ ${name}`);
      passed++;
    } else {
      console.error(`  ❌ ${name}`);
    }
  }

  // Trim
  assert(TransformRegistry.trim('   Тест   Строки  \n ') === 'Тест Строки', 'trim: extra whitespace removed');

  // Strip HTML
  assert(TransformRegistry.stripHtml('<p>Оборудование <b>для ДЦ</b></p>') === 'Оборудование для ДЦ', 'stripHtml: tags stripped');

  // Amounts
  assert(TransformRegistry.parseAmountKzt('12 400 000 ₸') === 12400000, 'parseAmountKzt: 12 400 000 ₸ -> 12400000');
  assert(TransformRegistry.parseAmountKzt('12,4 млн тенге') === 12400000, 'parseAmountKzt: 12,4 млн -> 12400000');
  assert(TransformRegistry.parseAmountKzt('1.5 млрд тг') === 1500000000, 'parseAmountKzt: 1.5 млрд -> 1500000000');

  // Dates
  const parsedDate = TransformRegistry.parseDateRu('25 июля 2026');
  assert(parsedDate.includes('2026-07-25'), 'parseDateRu: 25 июля 2026 -> ISO format');

  // Regex extract
  assert(TransformRegistry.regexExtract('Лот № 98765-KZ от 2026', '№\\s*([0-9A-Z-]+)') === '98765-KZ', 'regexExtract: extracts pattern');

  if (passed !== total) {
    throw new Error(`Transforms tests failed: ${passed}/${total} passed`);
  }
}

testTransforms();
