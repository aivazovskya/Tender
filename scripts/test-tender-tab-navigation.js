async function runTests() {
  console.log('🧪 Тестирование открытия карточки тендера на отдельной странице /tenders/[id]...\n');

  let passed = 0;
  let failed = 0;

  const assert = (condition, desc) => {
    if (condition) {
      console.log(`  ✅ PASS: ${desc}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${desc}`);
      failed++;
    }
  };

  // 1. Test GET /api/tenders/[id] for existing mock tender
  console.log('1. Тестирование API эндпоинта GET /api/tenders/t-101:');
  try {
    const res = await fetch('http://localhost:3000/api/tenders/t-101');
    assert(res.status === 200, `HTTP статус 200 OK (получен ${res.status})`);

    const json = await res.json();
    assert(json.success === true, 'Ответ содержит success: true');
    assert(json.data && json.data.id === 't-101', `Тендер найден по ID t-101 (${json.data?.title})`);
    assert(json.data.amount > 0, `Сумма тендера: ${json.data.amount.toLocaleString('ru-RU')} ₸`);
    assert(Array.isArray(json.data.documents), `Присутствует массив документов (найдено: ${json.data.documents.length})`);
    assert(Array.isArray(json.data.riskFlags), `Присутствует массив факторов риска (найдено: ${json.data.riskFlags.length})`);
  } catch (err) {
    assert(false, `Сбой API GET /api/tenders/t-101: ${err.message}`);
  }

  // 2. Test GET /api/tenders/[id] for fallback/externalId
  console.log('\n2. Тестирование API эндпоинта GET /api/tenders/GOS-2026-987123:');
  try {
    const res = await fetch('http://localhost:3000/api/tenders/GOS-2026-987123');
    assert(res.status === 200, `HTTP статус 200 OK для externalId (получен ${res.status})`);

    const json = await res.json();
    assert(json.success === true, 'Ответ содержит success: true');
    assert(json.data && json.data.externalId === 'GOS-2026-987123', `Тендер найден по externalId GOS-2026-987123`);
  } catch (err) {
    assert(false, `Сбой API GET /api/tenders/GOS-2026-987123: ${err.message}`);
  }

  // 3. Test GET /api/tenders/[id] 404 for non-existent tender
  console.log('\n3. Тестирование API эндпоинта GET /api/tenders/non-existent-id-999999:');
  try {
    const res = await fetch('http://localhost:3000/api/tenders/non-existent-id-999999');
    assert(res.status === 404, `Несуществующий тендер возвращает 404 Not Found (получен ${res.status})`);
    const json = await res.json();
    assert(json.success === false, 'Ответ содержит success: false');
  } catch (err) {
    assert(false, `Сбой проверки 404: ${err.message}`);
  }

  // 4. Test Web Page Route GET /tenders/t-101 (HTML rendering)
  console.log('\n4. Тестирование веб-страницы GET http://localhost:3000/tenders/t-101:');
  try {
    const res = await fetch('http://localhost:3000/tenders/t-101');
    assert(res.status === 200, `Страница /tenders/t-101 вернула HTTP 200 OK (получен ${res.status})`);

    const html = await res.text();
    assert(html.includes('TenderAI') || html.includes('<!DOCTYPE html>'), 'Страница содержит HTML разметку Next.js');
  } catch (err) {
    assert(false, `Сбой загрузки страницы /tenders/t-101: ${err.message}`);
  }

  console.log(`\n========================================`);
  console.log(`Итог тестов: Пройдено: ${passed}, Ошибок: ${failed}`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Крах тестирования:', err);
  process.exit(1);
});
