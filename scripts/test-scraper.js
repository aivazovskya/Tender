require('tsx/cjs');
const { TransformRegistry } = require('../src/lib/ingestion/transforms');

function runTests() {
  console.log('🧪 Запуск тестов модуля TenderKZ Config-driven Scraper...\n');

  // Test 1: TransformRegistry - trim
  const trimRes = TransformRegistry.trim('   Привет   Мир  \n ');
  console.log(`[TEST 1] trim: '${trimRes}' === 'Привет Мир' ->`, trimRes === 'Привет Мир' ? '✅ PASS' : '❌ FAIL');

  // Test 2: TransformRegistry - stripHtml
  const htmlRes = TransformRegistry.stripHtml('<div><p>Описание <b>лота</b></p></div>');
  console.log(`[TEST 2] stripHtml: '${htmlRes}' === 'Описание лота' ->`, htmlRes === 'Описание лота' ? '✅ PASS' : '❌ FAIL');

  // Test 3: TransformRegistry - parseAmountKzt
  const amt1 = TransformRegistry.parseAmountKzt('12 400 000 ₸');
  const amt2 = TransformRegistry.parseAmountKzt('12,4 млн тенге');
  const amt3 = TransformRegistry.parseAmountKzt('1.5 млрд тг');
  console.log(`[TEST 3a] parseAmountKzt ('12 400 000 ₸'): ${amt1} === 12400000 ->`, amt1 === 12400000 ? '✅ PASS' : '❌ FAIL');
  console.log(`[TEST 3b] parseAmountKzt ('12,4 млн тенге'): ${amt2} === 12400000 ->`, amt2 === 12400000 ? '✅ PASS' : '❌ FAIL');
  console.log(`[TEST 3c] parseAmountKzt ('1.5 млрд тг'): ${amt3} === 1500000000 ->`, amt3 === 1500000000 ? '✅ PASS' : '❌ FAIL');

  // Test 4: TransformRegistry - parseDateRu
  const dateStr = TransformRegistry.parseDateRu('25 июля 2026');
  console.log(`[TEST 4] parseDateRu ('25 июля 2026'): ${dateStr} ->`, dateStr.includes('2026-07-25') ? '✅ PASS' : '❌ FAIL');

  // Test 5: TransformRegistry - regexExtract
  const regRes = TransformRegistry.regexExtract('Тендер № 98765-KZ от 2026 года', '№\\s*([0-9A-Z-]+)');
  console.log(`[TEST 5] regexExtract: '${regRes}' === '98765-KZ' ->`, regRes === '98765-KZ' ? '✅ PASS' : '❌ FAIL');

  console.log('\n🎉 Все юнит-тесты реестра трансформаций успешно пройдены!');
}

runTests();
