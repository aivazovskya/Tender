require('tsx/cjs');
const assert = require('assert');
const { DocGeneratorService } = require('../../src/lib/services/doc-generator.service');
const { prisma } = require('../../src/lib/prisma');

console.log('🧪 Starting Document Generator & Requirements Auto-fill Test Suite...\n');

async function testScalarPlaceholders() {
  console.log('1️⃣ Testing standard scalar placeholder resolution...');
  const tender = {
    title: 'Поставка серверного оборудования',
    amount: 15500000,
    customerName: 'АО "Национальные информационные технологии"',
    deadlineDate: new Date('2026-10-15T18:00:00.000Z')
  };

  const profile = {
    companyName: 'ТОО "Bastion Systems"',
    bin: '123456789012'
  };

  const template = 'Компания: {{companyName}}, БИН: {{bin}}, Тендер: {{tenderTitle}}, Заказчик: {{customerName}}, Сумма: {{tenderAmount}} ₸, Дедлайн: {{deadlineDate}}, Дата: {{today}}';
  const resolved = DocGeneratorService.resolvePlaceholders(template, tender, profile);

  assert(resolved.includes('ТОО "Bastion Systems"'), 'companyName resolved');
  assert(resolved.includes('123456789012'), 'bin resolved');
  assert(resolved.includes('Поставка серверного оборудования'), 'tenderTitle resolved');
  assert(resolved.includes('АО "Национальные информационные технологии"'), 'customerName resolved');
  assert(resolved.includes('15\u00A0500\u00A0000') || resolved.includes('15 500 000'), 'tenderAmount formatted');
  assert(resolved.includes('15.10.2026'), 'deadlineDate formatted');
  console.log('   ✅ All scalar placeholders correctly resolved');
}

async function testRequirementsFormatting() {
  console.log('2️⃣ Testing requirements list formatting & prioritization...');
  const tender = { title: 'Лот 1', amount: 1000000 };
  const profile = { companyName: 'Тест', bin: '000000000000' };

  // 2.1 Empty requirements
  const template = 'Раздел требований:\n{{requirementsList}}';
  const emptyResolved = DocGeneratorService.resolvePlaceholders(template, tender, profile, { requirements: [] });
  assert(emptyResolved.includes('Квалификационные и технические требования'), 'Empty requirements has safe fallback text');
  console.log('   ✅ Empty requirements produces full compliance fallback');

  // 2.2 Prioritization: completed items first
  const reqs = [
    { label: 'Наличие лицензии на СМР', isCompleted: false, notes: 'Лицензия 1-й категории' },
    { label: 'Опыт работы не менее 3 лет', isCompleted: true, notes: 'Прикреплены акты выполненных работ' },
    { label: 'Сертификат CT-KZ', isCompleted: true, notes: 'Доля 65%' }
  ];

  const resolved = DocGeneratorService.resolvePlaceholders(template, tender, profile, { requirements: reqs });
  const lines = resolved.split('\n');

  // Completed items must come before uncompleted item
  const expIdx = lines.findIndex(l => l.includes('Опыт работы не менее 3 лет'));
  const certIdx = lines.findIndex(l => l.includes('Сертификат CT-KZ'));
  const licIdx = lines.findIndex(l => l.includes('Наличие лицензии на СМР'));

  assert(expIdx !== -1 && certIdx !== -1 && licIdx !== -1, 'All requirements present');
  assert(expIdx < licIdx, 'Completed item (experience) ordered before uncompleted item (license)');
  assert(certIdx < licIdx, 'Completed item (cert) ordered before uncompleted item (license)');
  assert(resolved.includes('Соответствует (подтверждено)'), 'Completed items marked as confirmed');
  assert(resolved.includes('Соответствует (обязуемся обеспечить согласно ТЗ)'), 'Uncompleted items marked with commitment');
  assert(resolved.includes('Прикреплены акты выполненных работ'), 'Notes included in output');
  console.log('   ✅ Requirements properly sorted (completed first) with status and notes');
}

async function testCommercialOfferFormatting() {
  console.log('3️⃣ Testing commercial offer & calculation integration...');
  const tender = { title: 'Лот 1', amount: 20000000 };
  const profile = { companyName: 'Тест', bin: '000000000000' };
  const template = '{{commercialOffer}}\nИтог: {{offeredPrice}} ₸';

  // 3.1 Without calculation
  const withoutCalc = DocGeneratorService.resolvePlaceholders(template, tender, profile);
  assert(withoutCalc.includes('20\u00A0000\u00A0000') || withoutCalc.includes('20 000 000'), 'Uses tender amount when calculation is missing');
  console.log('   ✅ Commercial offer falls back gracefully when calculation is missing');

  // 3.2 With calculation
  const calc = {
    recommendedPrice: 18500000,
    totalCost: 15000000,
    targetMarginPct: 18.9
  };
  const withCalc = DocGeneratorService.resolvePlaceholders(template, tender, profile, { calculation: calc });
  assert(withCalc.includes('18\u00A0500\u00A0000') || withCalc.includes('18 500 000'), 'Recommended price included in offer');
  assert(withCalc.includes('15\u00A0000\u00A0000') || withCalc.includes('15 000 000'), 'Total cost included in offer');
  assert(withCalc.includes('18.9%'), 'Target margin included in offer');
  console.log('   ✅ Commercial offer accurately formats calculation, total cost, and target margin');
}

async function testLoadGenerationContext() {
  console.log('4️⃣ Testing loadGenerationContext logic & fallbacks...');
  const origFindManyReq = prisma.tenderRequirementItem.findMany;
  const origFindUniqueTender = prisma.tender.findUnique;
  const origFindUniqueCalc = prisma.tenderCalculation.findUnique;

  try {
    // 4.1 Requirements exist in DB
    prisma.tenderRequirementItem.findMany = async () => [
      { label: 'Req 1', isCompleted: true, notes: 'Ok' }
    ];
    prisma.tenderCalculation.findUnique = async () => ({
      recommendedPrice: 5000000,
      totalCost: 4000000,
      targetMarginPct: 20,
      startPrice: 6000000
    });

    const ctx1 = await DocGeneratorService.loadGenerationContext('tender-1', 'comp-1');
    assert.strictEqual(ctx1.requirements.length, 1);
    assert.strictEqual(ctx1.requirements[0].label, 'Req 1');
    assert.strictEqual(ctx1.calculation.recommendedPrice, 5000000);
    console.log('   ✅ DB requirements and calculation loaded properly');

    // 4.2 Fallback to aiKeyRequirements when DB requirement items are empty
    prisma.tenderRequirementItem.findMany = async () => [];
    prisma.tender.findUnique = async () => ({
      aiKeyRequirements: ['Наличие сертификата ИСО 9001', 'Гарантия 24 месяца']
    });
    prisma.tenderCalculation.findUnique = async () => null;

    const ctx2 = await DocGeneratorService.loadGenerationContext('tender-2');
    assert.strictEqual(ctx2.requirements.length, 2);
    assert.strictEqual(ctx2.requirements[0].label, 'Наличие сертификата ИСО 9001');
    assert.strictEqual(ctx2.requirements[0].isCompleted, false);
    assert.strictEqual(ctx2.calculation, null);
    console.log('   ✅ Fallback to aiKeyRequirements works when requirement items are empty');
  } finally {
    prisma.tenderRequirementItem.findMany = origFindManyReq;
    prisma.tender.findUnique = origFindUniqueTender;
    prisma.tenderCalculation.findUnique = origFindUniqueCalc;
  }
}

async function testDocxGeneration() {
  console.log('5️⃣ Testing DOCX binary buffer creation...');
  const title = 'Техническая спецификация';
  const body = `1. ОБЩИЕ СВЕДЕНИЯ\nЗаказчик: Тест\n\n2. ТРЕБОВАНИЯ\n1. Требование 1: Выполнено\n\n3. ГАРАНТИИ\nГарантируем качество.`;

  const buffer = await DocGeneratorService.generateDocxBuffer(title, body);
  assert(Buffer.isBuffer(buffer), 'Output must be a Buffer');
  assert(buffer.length > 500, `Buffer must be valid binary file, size: ${buffer.length} bytes`);
  console.log(`   ✅ DOCX buffer generated successfully (${buffer.length} bytes)`);
}

async function runAll() {
  try {
    await testScalarPlaceholders();
    await testRequirementsFormatting();
    await testCommercialOfferFormatting();
    await testLoadGenerationContext();
    await testDocxGeneration();

    console.log('\n🎉 All Document Generator & Requirements Auto-fill tests passed successfully!');
  } catch (err) {
    console.error('\n❌ Document Generator test failed:', err);
    process.exit(1);
  }
}

runAll();