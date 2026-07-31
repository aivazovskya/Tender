const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Начало сидинга базы данных TenderAI...');

  // 1. Seed Data Sources
  const goszakupSource = await prisma.dataSource.upsert({
    where: { name: 'GOSZAKUP' },
    update: {},
    create: {
      name: 'GOSZAKUP',
      displayName: 'goszakup.gov.kz (ЕГСЗ РК)',
      adapterType: 'API',
      isActive: true,
      checkIntervalMins: 15,
      healthStatus: 'HEALTHY',
      successRate24h: 99.8,
      totalIngested: 14290
    }
  });

  const samrukSource = await prisma.dataSource.upsert({
    where: { name: 'SAMRUK_KAZYNA' },
    update: {},
    create: {
      name: 'SAMRUK_KAZYNA',
      displayName: 'portal.sk.kz (Самрук-Казына)',
      adapterType: 'API',
      isActive: true,
      checkIntervalMins: 30,
      healthStatus: 'HEALTHY',
      successRate24h: 99.4,
      totalIngested: 8340
    }
  });

  const b2bScraperSource = await prisma.dataSource.upsert({
    where: { name: 'B2B_ETS_KAZAKHSTAN' },
    update: {
      adapterType: 'SCRAPER'
    },
    create: {
      name: 'B2B_ETS_KAZAKHSTAN',
      displayName: 'Товарная биржа ETS (ets.kz / B2B)',
      adapterType: 'SCRAPER',
      isActive: true,
      checkIntervalMins: 60,
      healthStatus: 'HEALTHY',
      successRate24h: 98.9,
      totalIngested: 2150
    }
  });

  await prisma.scraperSourceConfig.upsert({
    where: { dataSourceId: b2bScraperSource.id },
    update: {},
    create: {
      dataSourceId: b2bScraperSource.id,
      renderMode: 'STATIC',
      listUrlTemplate: 'https://example-tenders.kz/list?page={page}',
      pagination: { startPage: 1, maxPages: 5, stopOnEmpty: true },
      listItemSelector: '.tender-item',
      fields: {
        externalId: { selector: '.tender-id', attr: 'text', transform: 'trim' },
        title: { selector: '.tender-title', attr: 'text', transform: 'trim' },
        detailUrl: { selector: 'a.tender-link', attr: 'href', transform: 'absoluteUrl' },
        amount: { selector: '.tender-price', attr: 'text', transform: 'parseAmountKzt' },
        region: { selector: '.tender-region', attr: 'text', transform: 'trim' },
        deadlineDate: { selector: '.tender-deadline', attr: 'text', transform: 'parseDateRu' }
      },
      detailPage: {
        enabled: true,
        fields: {
          description: { selector: '#tender-description', attr: 'html', transform: 'stripHtml' }
        }
      },
      respectRobotsTxt: true,
      active: true
    }
  });

  // Onboard Astana Akimat Procurement Scraper Source
  const astanaSource = await prisma.dataSource.upsert({
    where: { name: 'ASTANA_AKIMAT' },
    update: { adapterType: 'SCRAPER' },
    create: {
      name: 'ASTANA_AKIMAT',
      displayName: 'Акимат г. Астана (astana.gov.kz)',
      adapterType: 'SCRAPER',
      isActive: true,
      checkIntervalMins: 30,
      healthStatus: 'HEALTHY',
      successRate24h: 100.0,
      totalIngested: 850
    }
  });

  await prisma.scraperSourceConfig.upsert({
    where: { dataSourceId: astanaSource.id },
    update: {},
    create: {
      dataSourceId: astanaSource.id,
      renderMode: 'STATIC',
      listUrlTemplate: 'https://astana.gov.kz/ru/tenders?page={page}',
      pagination: { startPage: 1, maxPages: 3, stopOnEmpty: true },
      listItemSelector: '.tender-card',
      fields: {
        externalId: { selector: '.card-id', attr: 'text', transform: 'trim' },
        title: { selector: '.card-title', attr: 'text', transform: 'trim' },
        detailUrl: { selector: 'a.card-link', attr: 'href', transform: 'absoluteUrl' },
        amount: { selector: '.card-price', attr: 'text', transform: 'parseAmountKzt' },
        region: { selector: '.card-region', attr: 'text', transform: 'trim' },
        deadlineDate: { selector: '.card-deadline', attr: 'text', transform: 'parseDateRu' }
      },
      respectRobotsTxt: true,
      active: true
    }
  });

  // Onboard KEGOC Sector Platform Scraper Source
  const kegocSource = await prisma.dataSource.upsert({
    where: { name: 'KEGOC_PROCUREMENT' },
    update: { adapterType: 'SCRAPER' },
    create: {
      name: 'KEGOC_PROCUREMENT',
      displayName: 'Портал закупок АО KEGOC (kegoc.kz)',
      adapterType: 'SCRAPER',
      isActive: true,
      checkIntervalMins: 45,
      healthStatus: 'HEALTHY',
      successRate24h: 100.0,
      totalIngested: 430
    }
  });

  await prisma.scraperSourceConfig.upsert({
    where: { dataSourceId: kegocSource.id },
    update: {},
    create: {
      dataSourceId: kegocSource.id,
      renderMode: 'STATIC',
      listUrlTemplate: 'https://kegoc.kz/ru/zakupki?page={page}',
      pagination: { startPage: 1, maxPages: 3, stopOnEmpty: true },
      listItemSelector: '.procurement-row',
      fields: {
        externalId: { selector: '.proc-id', attr: 'text', transform: 'trim' },
        title: { selector: '.proc-title', attr: 'text', transform: 'trim' },
        detailUrl: { selector: 'a.proc-link', attr: 'href', transform: 'absoluteUrl' },
        amount: { selector: '.proc-sum', attr: 'text', transform: 'parseAmountKzt' },
        region: { selector: '.proc-region', attr: 'text', transform: 'trim' },
        deadlineDate: { selector: '.proc-date', attr: 'text', transform: 'parseDateRu' }
      },
      respectRobotsTxt: true,
      active: true
    }
  });

  console.log('✅ Источники данных Акимата Астаны и АО KEGOC успешно добавлены в БД');

  // 2. Seed Initial Tenders
  const tender1 = await prisma.tender.upsert({
    where: { source_externalId: { source: 'GOSZAKUP', externalId: 'GOS-2026-987123' } },
    update: {},
    create: {
      source: 'GOSZAKUP',
      externalId: 'GOS-2026-987123',
      title: 'Поставка серверного оборудования и сетевых коммутаторов для дата-центра Акимата г. Астана',
      description: 'Организация закупки 8 стоечных серверов 2U, 4 коммутаторов 10G Cisco/Huawei, монтаж и пусконаладочные работы.',
      customerName: 'ГУ "Управление цифровизации города Астана"',
      customerBin: '170440023910',
      category: 'ИТ и Телекоммуникации',
      industryTags: ['Серверы', 'Сетевое оборудование', 'ИТ-услуги'],
      procurementMethod: 'OPEN_TENDER',
      amount: 48500000.0,
      currency: 'KZT',
      region: 'г. Астана',
      publishDate: new Date('2026-07-20T09:00:00Z'),
      deadlineDate: new Date('2026-08-05T18:00:00Z'),
      applicationSecurityAmount: 1455000.0,
      applicationSecurityPercent: 3.0,
      status: 'ACTIVE',
      sourceUrl: 'https://goszakup.gov.kz/ru/announce/index/987123',
      aiSummary: 'Тендер на поставку 8 серверов 2U и 4 10G-коммутаторов с монтажом. Оплата по факту выполнения работ.',
      aiKeyRequirements: ['Сертификаты соответствия СТ-KZ', 'Опыт поставки от 3-х лет', 'Авторизационное письмо вендора'],
      riskScore: 25
    }
  });

  console.log('✅ Базовые тендеры успешно добавлены');
  console.log('🎉 Сидинг базы данных TenderAI завершен успешно!');
}

main()
  .catch((e) => {
    console.error('❌ Ошибка при сидинге БД:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
