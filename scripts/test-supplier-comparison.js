const fs = require('fs');
const path = require('path');

async function runTests() {
  console.log('🧪 Запуск тестов модуля "Конкурентный лист по выбору поставщика"...\n');

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

  // 1. Test Service Calculations & Excel Generation
  console.log('1. Тестирование генерации Excel-файла через ExcelJS:');
  try {
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Конкурентный лист');
    sheet.getCell('A2').value = 'КОНКУРЕНТНЫЙ ЛИСТ ПО ВЫБОРУ ПОСТАВЩИКА';
    sheet.getCell('E17').value = 5000;
    sheet.getCell('F17').value = 1785.71;
    sheet.getCell('G17').value = { formula: 'E17*F17', result: 8928550 };
    sheet.getCell('H17').value = 2000;
    sheet.getCell('I17').value = { formula: 'E17*H17', result: 10000000 };

    const buffer = await workbook.xlsx.writeBuffer();
    assert(Buffer.isBuffer(Buffer.from(buffer)) && buffer.byteLength > 2000, `Excel-буфер сформирован успешно (размер: ${buffer.byteLength} байт)`);
  } catch (err) {
    assert(false, `Ошибка ExcelJS: ${err.message}`);
  }

  // 2. Test HTTP API /api/tenders/[id]/supplier-comparison
  console.log('\n2. Тестирование API эндпоинта GET /api/tenders/test-tender-1/supplier-comparison:');
  try {
    const res = await fetch('http://localhost:3000/api/tenders/test-tender-1/supplier-comparison');
    assert(res.status === 200, `HTTP статус 200 OK (получен ${res.status})`);

    const json = await res.json();
    assert(json.success === true, 'Ответ содержит success: true');
    assert(Array.isArray(json.data?.suppliers) && json.data.suppliers.length >= 2, `Присутствуют поставщики (найдено: ${json.data?.suppliers?.length})`);
    assert(Array.isArray(json.data?.lineItems) && json.data.lineItems.length >= 1, `Присутствуют позиции ТРУ (найдено: ${json.data?.lineItems?.length})`);
    assert(Array.isArray(json.data?.summaries) && json.data.summaries.length >= 2, `Рассчитаны итоги summaries по поставщикам (найдено: ${json.data?.summaries?.length})`);
    assert(json.data.totalBudgetKzt12 > 0, `Общий бюджет рассчитан корректно (${json.data.totalBudgetKzt12} ₸)`);
  } catch (err) {
    assert(false, `Сбой вызова GET API: ${err.message}`);
  }

  // 3. Test HTTP API POST /api/tenders/[id]/supplier-comparison
  console.log('\n3. Тестирование API эндпоинта POST /api/tenders/test-tender-1/supplier-comparison (Сохранение изменений):');
  try {
    const payload = {
      tenderId: 'test-tender-1',
      tenderNumber: 'LOT-TEST-999',
      tradingPlatform: 'goszakup.gov.kz',
      customerName: 'АО «КазМунайГаз»',
      customerBin: '020640001234',
      exchangeRate: 5.25,
      creditAmount: 4000000,
      creditDays: 60,
      creditCost: 118356,
      selectedSupplierId: 'supp-1',
      suppliers: [
        {
          id: 'supp-1',
          name: 'ТОО «KAZ Chemical Supply»',
          address: 'г. Алматы',
          email: 'sales@kazchem.kz',
          phone: '+7 727 123-45-67',
          paymentTerms: '100% постоплата 30 дней',
          paymentForm: 'Безналичный расчет (KZT)',
          bidSecurity: 100000,
          discountPercent: 5,
          order: 0,
          isSelected: true
        },
        {
          id: 'supp-2',
          name: 'ТОО «ПромСнаб Астана»',
          address: 'г. Астана',
          email: 'info@promsnab.kz',
          phone: '+7 7172 99-88-77',
          paymentTerms: '30% аванс, 70% факт',
          paymentForm: 'Безналичный расчет (KZT)',
          bidSecurity: 100000,
          discountPercent: 0,
          order: 1,
          isSelected: false
        }
      ],
      lineItems: [
        {
          id: 'item-1',
          order: 1,
          mpzCode: 'MPZ-001',
          name: 'Антифриз G12 (-40°C)',
          unit: 'л',
          quantity: 5000,
          budgetPriceKzt0: 1785.71,
          budgetPriceKzt12: 2000,
          prices: {
            'supp-1': {
              lineItemId: 'item-1',
              supplierId: 'supp-1',
              proposedName: 'Антифриз Nord Frost G12',
              priceKzt0: 1500,
              priceKzt12: 1680,
              priceRub0: 285.71,
              currency: 'KZT'
            },
            'supp-2': {
              lineItemId: 'item-1',
              supplierId: 'supp-2',
              proposedName: 'Антифриз SINTEC LUX G12',
              priceKzt0: 1600,
              priceKzt12: 1792,
              priceRub0: 304.76,
              currency: 'KZT'
            }
          }
        }
      ]
    };

    const postRes = await fetch('http://localhost:3000/api/tenders/test-tender-1/supplier-comparison', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    assert(postRes.status === 200, `POST статус 200 OK (получен ${postRes.status})`);

    const postJson = await postRes.json();
    assert(postJson.success === true, 'POST сохранение вернуло success: true');
    assert(postJson.data?.exchangeRate === 5.25, `Курс валют обновлен: ${postJson.data?.exchangeRate}`);

    const supp1Summary = postJson.data?.summaries?.find(s => s.supplierId === 'supp-1');
    assert(supp1Summary && supp1Summary.discountPercent === 5, `Скидка поставщика 1 применена (5%)`);
    assert(supp1Summary && supp1Summary.isBestPrice === true, `Поставщик 1 отмечен как лучшая цена (isBestPrice: true)`);
    assert(supp1Summary && supp1Summary.grossMarginKzt > 0, `Валовая маржа рассчитана: ${supp1Summary?.grossMarginKzt} ₸ (${supp1Summary?.grossMarginPct}%)`);
    assert(supp1Summary && supp1Summary.netMarginWithCreditKzt > 0, `Чистая прибыль с учетом кредита: ${supp1Summary?.netMarginWithCreditKzt} ₸ (${supp1Summary?.netMarginWithCreditPct}%)`);
  } catch (err) {
    assert(false, `Сбой вызова POST API: ${err.message}`);
  }

  // 4. Test HTTP API GET /api/tenders/[id]/supplier-comparison/export-excel
  console.log('\n4. Тестирование API эндпоинта экспорта GET /api/tenders/test-tender-1/supplier-comparison/export-excel:');
  try {
    const exportRes = await fetch('http://localhost:3000/api/tenders/test-tender-1/supplier-comparison/export-excel');
    assert(exportRes.status === 200, `Экспорт вернул статус 200 OK (получен ${exportRes.status})`);

    const contentType = exportRes.headers.get('content-type') || '';
    assert(contentType.includes('spreadsheetml.sheet'), `Content-Type корректный (${contentType})`);

    const arrayBuf = await exportRes.arrayBuffer();
    const excelBuf = Buffer.from(arrayBuf);
    assert(excelBuf.length > 5000, `Размер экспортированного .xlsx файла: ${excelBuf.length} байт`);

    // Verify workbook can be read by ExcelJS
    const ExcelJS = require('exceljs');
    const readWb = new ExcelJS.Workbook();
    await readWb.xlsx.load(excelBuf);
    const readSheet = readWb.getWorksheet('Конкурентный лист');
    assert(readSheet !== undefined, 'Вкладка "Конкурентный лист" успешно прочитана из экспортированного файла');
    const titleVal = String(readSheet.getCell('A2').value || '');
    assert(titleVal.toLowerCase().includes('конкурентный лист'), `Заголовок шапки содержит "Конкурентный лист": "${titleVal}"`);
  } catch (err) {
    assert(false, `Сбой экспорта Excel: ${err.message}`);
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
