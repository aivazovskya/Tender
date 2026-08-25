const ExcelJS = require('exceljs');
const fs = require('fs');

async function testExportAndCompare() {
  const comparisonData = {
    tenderId: 't-antifreeze',
    tenderNumber: '5489-ОТ',
    tradingPlatform: 'goszakup.gov.kz',
    customerName: 'ТОО "СП "КазГерМунай"',
    customerBin: '931240000123',
    exchangeRate: 5.65,
    publishDate: '2024-01-10T09:00:00Z',
    deadlineDate: '2024-01-22T15:00:00Z',
    tenderTitle: 'Приобретение охлаждающей жидкости (Антифриз G12) для нужд месторождения Акшабулак',
    creditAmount: 6354250,
    creditDays: 75,
    creditRate: 12.6,
    creditCost: 165475,
    selectedSupplierId: 'supp-1',
    suppliers: [
      {
        id: 'supp-1',
        name: 'ТОО "Nord Chemical KZ"',
        address: 'г. Алматы, ул. Райымбека 115',
        email: 'info@nordchemical.kz',
        phone: '+7 727 345-67-89',
        paymentTerms: '100% постоплата в течение 30 календарных дней',
        paymentForm: 'Безналичный расчет в KZT',
        bidSecurity: 150000,
        deliveryPeriod: 'В течение 15 календарных дней с момента заявки',
        warrantyPeriod: '24 месяца',
        incotermsBasis: 'DDP склад Покупателя (м/р Акшабулак)',
        deliveryMethod: 'Автотранспорт Поставщика',
        tolerance: '± 0%',
        commercialOfferNumberDate: '№ 12-КП от 15.01.2024г.',
        supplierPsd: 'Да',
        additionalInfo: 'Официальный дистрибьютор, сертификаты СТ-KZ в наличии',
        discountPercent: 3,
        order: 0,
        isSelected: true
      },
      {
        id: 'supp-2',
        name: 'АО "Казэнергокабель"',
        address: 'г. Павлодар, Пром. Зона Северная 6/2',
        email: 'Astana-kazkabel@mail.ru',
        phone: '87471132590',
        paymentTerms: 'По факту поставки в течение 45 дней',
        paymentForm: 'Безналичный расчет в KZT',
        bidSecurity: 150000,
        deliveryPeriod: 'До 20 дней',
        warrantyPeriod: '12 месяцев',
        incotermsBasis: 'DDP Акшабулак',
        deliveryMethod: 'Авто',
        tolerance: '0%',
        commercialOfferNumberDate: '№ 21-603 от 09.12.2021г.',
        supplierPsd: 'Да',
        additionalInfo: 'Прямой производитель',
        discountPercent: 0,
        order: 1,
        isSelected: false
      },
      {
        id: 'supp-3',
        name: 'ТОО "MetaTrade Logistics"',
        address: 'г. Астана, ул. Достык 18',
        email: 'sales@metatrade.kz',
        phone: '+7 7172 70-80-90',
        paymentTerms: '30% предоплата, 70% по факту',
        paymentForm: 'Безналичный расчет в KZT',
        bidSecurity: 150000,
        deliveryPeriod: '30 дней',
        warrantyPeriod: '12 месяцев',
        incotermsBasis: 'DDP склад',
        deliveryMethod: 'Ж/Д и авто',
        tolerance: '± 5%',
        commercialOfferNumberDate: '№ MT-44 от 18.01.2024г.',
        supplierPsd: 'Нет',
        additionalInfo: 'Поставка из РФ',
        discountPercent: 0,
        order: 2,
        isSelected: false
      }
    ],
    lineItems: [
      {
        id: 'item-1',
        order: 1,
        mpzCode: '10045892',
        name: 'Охлаждающая жидкость Антифриз G12 (-40°C), канистра 20л',
        unit: 'литр',
        quantity: 5000,
        budgetPriceKzt0: 1250,
        budgetPriceKzt12: 1400,
        prices: {
          'supp-1': {
            proposedName: 'Антифриз Nord Frost G12 Red (-40°C)',
            priceRub0: 176.99,
            priceKzt0: 1000,
            priceKzt12: 1120,
            currency: 'KZT'
          },
          'supp-2': {
            proposedName: 'Антифриз КАЗ-ФРОСТ G12 (-40°C)',
            priceRub0: 194.69,
            priceKzt0: 1100,
            priceKzt12: 1232,
            currency: 'KZT'
          },
          'supp-3': {
            proposedName: 'Антифриз SINTEC LUX G12 (-40°C)',
            priceRub0: 203.54,
            priceKzt0: 1150,
            priceKzt12: 1288,
            currency: 'KZT'
          }
        }
      },
      {
        id: 'item-2',
        order: 2,
        mpzCode: '10045893',
        name: 'Концентрат охлаждающей жидкости Антифриз G12 Plus (-65°C)',
        unit: 'литр',
        quantity: 1500,
        budgetPriceKzt0: 1600,
        budgetPriceKzt12: 1792,
        prices: {
          'supp-1': {
            proposedName: 'Концентрат Nord Frost G12+ (-65°C)',
            priceRub0: 230.09,
            priceKzt0: 1300,
            priceKzt12: 1456,
            currency: 'KZT'
          },
          'supp-2': {
            proposedName: 'Концентрат КАЗ-ФРОСТ G12+ (-65°C)',
            priceRub0: 247.79,
            priceKzt0: 1400,
            priceKzt12: 1568,
            currency: 'KZT'
          },
          'supp-3': {
            proposedName: 'Концентрат SINTEC G12+ (-65°C)',
            priceRub0: 256.64,
            priceKzt0: 1450,
            priceKzt12: 1624,
            currency: 'KZT'
          }
        }
      }
    ]
  };

  const res = await fetch('http://localhost:3000/api/tenders/test-tender-1/supplier-comparison/export-excel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(comparisonData)
  });

  if (!res.ok) {
    throw new Error(`Export API returned HTTP ${res.status}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  fs.writeFileSync('scripts/generated-comparison-test.xlsx', buffer);
  console.log(`Generated Excel size: ${buffer.length} bytes saved to scripts/generated-comparison-test.xlsx\n`);

  // Load generated workbook and inspect
  const genWb = new ExcelJS.Workbook();
  await genWb.xlsx.load(buffer);
  const genWs = genWb.worksheets[0];

  console.log(`=== GENERATED EXCEL STRUCTURE (${genWs.rowCount} rows, ${genWs.columnCount} cols) ===`);
  for (let r = 1; r <= Math.min(genWs.rowCount, 45); r++) {
    const row = genWs.getRow(r);
    const cells = [];
    row.eachCell({ includeEmpty: false }, (cell) => {
      if (cell.address === cell.master.address) {
        let v = cell.value;
        if (v && typeof v === 'object' && v.formula) v = `=${v.formula} (res=${v.result})`;
        cells.push(`${cell.address}="${v}"`);
      }
    });
    if (cells.length > 0) {
      console.log(`Row ${r.toString().padStart(2, ' ')}: ${cells.join(' | ')}`);
    }
  }
}

testExportAndCompare().catch(console.error);
