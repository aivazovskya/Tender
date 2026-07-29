import { Tender, DataSourceStatus } from './types/tender';

export const INITIAL_TENDERS: Tender[] = [
  {
    id: 't-101',
    source: 'GOSZAKUP',
    externalId: 'GOS-2026-987123',
    title: 'Поставка серверного оборудования и сетевых коммутаторов для дата-центра Акимата г. Астана',
    description: 'Организация закупки 8 стоечных серверов 2U, 4 коммутаторов 10G Cisco/Huawei, монтаж и пусконаладочные работы в здании Акимата.',
    customerName: 'ГУ "Управление цифровизации города Астана"',
    customerBin: '170440023910',
    category: 'ИТ и Телекоммуникации',
    industryTags: ['Серверы', 'Сетевое оборудование', 'ИТ-услуги', 'Оргтехника'],
    procurementMethod: 'OPEN_TENDER',
    amount: 48500000, // 48.5 млн KZT
    currency: 'KZT',
    region: 'г. Астана',
    publishDate: '2026-07-20T09:00:00Z',
    deadlineDate: '2026-08-05T18:00:00Z',
    applicationSecurityAmount: 1455000, // 3%
    applicationSecurityPercent: 3,
    status: 'ACTIVE',
    sourceUrl: 'https://goszakup.gov.kz/ru/announce/index/987123',
    aiSummary: 'Тендер на поставку 8 серверов 2U и 4 10G-коммутаторов с монтажом. Оплата в течение 30 банковских дней после подписания акта приема-передачи. Гарантийный срок — не менее 36 месяцев.',
    aiKeyRequirements: [
      'Сертификаты соответствия СТ-KZ на монтажные работы',
      'Опыт поставки аналогичного оборудования от 3-х лет',
      'Наличие авторизационного письма от производителя оборудования',
      'Обеспечение заявки в размере 3% (1,455,000 KZT)'
    ],
    riskScore: 25,
    riskFlags: [
      {
        id: 'rf-1',
        code: 'AUTHORIZATION_LETTER_REQ',
        severity: 'MEDIUM',
        title: 'Авторизационное письмо',
        description: 'Требуется строго авторизационное письмо от вендора оборудования. Возможен риск сужения конкуренции.'
      }
    ],
    documents: [
      { id: 'doc-1', fileName: 'Техническая_спецификация_Серверы_2026.pdf', fileUrl: '/docs/spec_servers.pdf', fileSize: '2.4 MB', fileType: 'pdf' },
      { id: 'doc-2', fileName: 'Проект_договора_поставки_Астана.docx', fileUrl: '/docs/contract_draft.docx', fileSize: '840 KB', fileType: 'docx' },
      { id: 'doc-3', fileName: 'Конкурсная_документация_ГОС_987123.pdf', fileUrl: '/docs/tender_rules.pdf', fileSize: '5.1 MB', fileType: 'pdf' }
    ],
    history: [
      { id: 'h-1', changedBy: 'Goszakup API', field: 'deadlineDate', oldValue: '2026-08-01', newValue: '2026-08-05', timestamp: '2026-07-22T10:15:00Z' },
      { id: 'h-2', changedBy: 'System Parser', field: 'amount', oldValue: '45000000', newValue: '48500000', timestamp: '2026-07-20T09:00:00Z' }
    ]
  },
  {
    id: 't-102',
    source: 'SAMRUK_KAZYNA',
    externalId: 'SK-2026-44589',
    title: 'Капитальный ремонт административного здания ДЗО АО "КазМунайГаз" в г. Атырау',
    description: 'Выполнение комплексных строительно-монтажных и отделочных работ, замена систем вентиляции и кондиционирования.',
    customerName: 'АО "Эмбамунайгаз" (Дочернее предприятие АО НК "КазМунайГаз")',
    customerBin: '040340001289',
    category: 'Строительство и Ремонт',
    industryTags: ['Капитальный ремонт', 'Вентиляция', 'СМР', 'Нефтегазовый сектор'],
    procurementMethod: 'OPEN_TENDER',
    amount: 185000000, // 185 млн KZT
    currency: 'KZT',
    region: 'Атырауская область',
    publishDate: '2026-07-18T14:30:00Z',
    deadlineDate: '2026-08-12T15:00:00Z',
    applicationSecurityAmount: 1850000, // 1%
    applicationSecurityPercent: 1,
    status: 'ACTIVE',
    sourceUrl: 'https://portal.sk.kz/tender/44589',
    aiSummary: 'Крупный лот на капитальный ремонт офисного здания в Атырау. Требуется лицензия на СМР II категории. Авансовый платеж предусматривается в размере 20% после предоставления банковской гарантии.',
    aiKeyRequirements: [
      'Лицензия на СМР II категории или выше',
      'Наличие квалифицированного инженерного персонала с аттестатами РК',
      'Опыт выполнения аналогичных капитальных ремонтов от 100 млн KZT за последние 2 года',
      'Банковская гарантия возврата аванса'
    ],
    riskScore: 65,
    riskFlags: [
      {
        id: 'rf-2',
        code: 'SHORT_SUBMISSION_WINDOW',
        severity: 'HIGH',
        title: 'Жесткие сроки квалификации',
        description: 'Заказчик требует предоставления специализированной финансовой отчетности за 3 года с аудит-заключением.'
      },
      {
        id: 'rf-3',
        code: 'CUSTOMER_CANCEL_HISTORY',
        severity: 'MEDIUM',
        title: 'История отмен лотов',
        description: 'Заказчик в 2025 году 2 раза отменял аналогичные конкурсы по техническим причинам.'
      }
    ],
    documents: [
      { id: 'doc-4', fileName: 'Дефектный_акт_и_смета_Атырау.pdf', fileUrl: '/docs/smeta_atyrau.pdf', fileSize: '12.8 MB', fileType: 'pdf' },
      { id: 'doc-5', fileName: 'ТЗ_Капремонт_Эмбамунайгаз.pdf', fileUrl: '/docs/tz_repair.pdf', fileSize: '3.4 MB', fileType: 'pdf' }
    ],
    history: []
  },
  {
    id: 't-103',
    source: 'GOSZAKUP',
    externalId: 'GOS-2026-112344',
    title: 'Услуги по разработке и сопровождению мобильного приложения "Smart Almaty"',
    description: 'Модернизация модулей электронной записи, интеграция с сервисами eGov и доработка системы уведомления жителей.',
    customerName: 'ГУ "Управление цифровизации города Алматы"',
    customerBin: '190240018765',
    category: 'ИТ и ПО',
    industryTags: ['Мобильная разработка', 'ПО', 'Smart City', 'eGov'],
    procurementMethod: 'PRICE_REQUEST',
    amount: 19800000, // 19.8 млн KZT
    currency: 'KZT',
    region: 'г. Алматы',
    publishDate: '2026-07-22T08:00:00Z',
    deadlineDate: '2026-07-29T17:00:00Z',
    applicationSecurityAmount: 198000,
    applicationSecurityPercent: 1,
    status: 'ACTIVE',
    sourceUrl: 'https://goszakup.gov.kz/ru/announce/index/112344',
    aiSummary: 'Запрос ценовых предложений на доработку iOS/Android приложения Smart Almaty. Срок выполнения работ — 60 календарных дней. Исходный код передается заказчику.',
    aiKeyRequirements: [
      'Опыт разработки на Flutter / React Native / Swift & Kotlin',
      'Подписанный NDA и соблюдение требований по хранению ПДн в РК (Yandex Cloud KZ / АО НИТ)',
      'Поддержка казахского и русского языков интерфейса'
    ],
    riskScore: 15,
    riskFlags: [],
    documents: [
      { id: 'doc-6', fileName: 'ТЗ_Smart_Almaty_2026.pdf', fileUrl: '/docs/smart_almaty_tz.pdf', fileSize: '1.8 MB', fileType: 'pdf' }
    ],
    history: []
  },
  {
    id: 't-104',
    source: 'SAMRUK_KAZYNA',
    externalId: 'SK-2026-88120',
    title: 'Закупка медицинского диагностического оборудования (УЗИ аппараты экспертного класса) в г. Шымкент',
    description: 'Поставка 3 комплектов ультразвуковых сканеров экспертного класса с датчиками для кардиологии и акушерства.',
    customerName: 'ТОО "Медицинский центр Самрук-Энерго"',
    customerBin: '120540009811',
    category: 'Медицина и Фармацевтика',
    industryTags: ['Медоборудование', 'УЗИ', 'Здравоохранение'],
    procurementMethod: 'OPEN_TENDER',
    amount: 92000000, // 92 млн KZT
    currency: 'KZT',
    region: 'г. Шымкент',
    publishDate: '2026-07-15T11:00:00Z',
    deadlineDate: '2026-08-08T18:00:00Z',
    applicationSecurityAmount: 920000,
    applicationSecurityPercent: 1,
    status: 'ACTIVE',
    sourceUrl: 'https://portal.sk.kz/tender/88120',
    aiSummary: 'Поставка 3 медсканеров УЗИ экспертного класса в Шымкент. В стоимость входит доставка, инсталляция, регистрация в МЗ РК и обучение персонала.',
    aiKeyRequirements: [
      'Регистрационное удостоверение Минздрава РК на медицинское изделие',
      'Сервисный центр в РК с сертифицированными инженерами',
      'Гарантийное обслуживание — 24 месяца'
    ],
    riskScore: 40,
    riskFlags: [
      {
        id: 'rf-4',
        code: 'REGISTRATION_CERT_STRICT',
        severity: 'MEDIUM',
        title: 'Строгие требования к регистрационному удостоверению РК',
        description: 'Удостоверение МЗ РК должно быть действительно на весь период исполнения договора.'
      }
    ],
    documents: [
      { id: 'doc-7', fileName: 'Спецификация_УЗИ_Шымкент.pdf', fileUrl: '/docs/uzi_spec.pdf', fileSize: '4.1 MB', fileType: 'pdf' }
    ],
    history: []
  },
  {
    id: 't-105',
    source: 'GOSZAKUP',
    externalId: 'GOS-2026-554109',
    title: 'Организация питания и кейтеринга для участников молодежного форума в г. Караганда',
    description: 'Предоставление комплексного 3-разового питания и кофе-брейков для 450 участников на протяжении 4 дней.',
    customerName: 'ГУ "Управление по вопросам молодежной политики Карагандинской области"',
    customerBin: '150140003321',
    category: 'Услуги питания и Кейтеринг',
    industryTags: ['Кейтеринг', 'Питание', 'Мероприятия'],
    procurementMethod: 'PRICE_REQUEST',
    amount: 8500000, // 8.5 млн KZT
    currency: 'KZT',
    region: 'Карагандинская область',
    publishDate: '2026-07-21T10:00:00Z',
    deadlineDate: '2026-07-28T16:00:00Z',
    applicationSecurityAmount: 85000,
    applicationSecurityPercent: 1,
    status: 'ACTIVE',
    sourceUrl: 'https://goszakup.gov.kz/ru/announce/index/554109',
    aiSummary: 'Кейтеринг для 450 человек на 4 дня в Караганде. Наличие санитарных книжек у персонала и санитарно-эпидемиологических заключений на пищеблок обязательно.',
    aiKeyRequirements: [
      'Санитарно-эпидемиологическое заключение СЭС на пищевое производство',
      'Наличие специализированного изотермического транспорта',
      'Меню должно содержать национальные и европейские блюда с калорийностью не менее 2800 ккал/день'
    ],
    riskScore: 20,
    riskFlags: [],
    documents: [
      { id: 'doc-8', fileName: 'Меню_и_требования_Караганда.pdf', fileUrl: '/docs/menu_karaganda.pdf', fileSize: '1.2 MB', fileType: 'pdf' }
    ],
    history: []
  },
  {
    id: 't-106',
    source: 'SAMRUK_KAZYNA',
    externalId: 'SK-2026-30911',
    title: 'Поставка спецодежды, средств индивидуальной защиты (СИЗ) и спецобуви для предприятий АО "Казатомпром"',
    description: 'Закупка зимних и летних комплектов спецодежды с огнеупорной и кислотостойкой пропиткой, защитных касок и респираторов.',
    customerName: 'АО "НАК "Казатомпром"',
    customerBin: '970840001556',
    category: 'Легкая промышленность и СИЗ',
    industryTags: ['Спецодежда', 'СИЗ', 'Атомная промышленность', 'СТ-KZ'],
    procurementMethod: 'OPEN_TENDER',
    amount: 142000000, // 142 млн KZT
    currency: 'KZT',
    region: 'Туркестанская область',
    publishDate: '2026-07-16T12:00:00Z',
    deadlineDate: '2026-08-10T17:00:00Z',
    applicationSecurityAmount: 1420000,
    applicationSecurityPercent: 1,
    status: 'ACTIVE',
    sourceUrl: 'https://portal.sk.kz/tender/30911',
    aiSummary: 'Большой лот Казатомпрома на спецодежду и СИЗ с высокой долей местного содержания. Обязателен сертификат СТ-KZ с долей казахстанского содержания не менее 65%.',
    aiKeyRequirements: [
      'Сертификат СТ-KZ на швейное производство (доля КС >= 65%)',
      'Протоколы испытаний тканей на огнестойкость и защиту от агрессивных сред',
      'Поставка партиями в течение 90 дней'
    ],
    riskScore: 35,
    riskFlags: [
      {
        id: 'rf-5',
        code: 'ST_KZ_STRICT_PERCENT',
        severity: 'MEDIUM',
        title: 'Высокий порог СТ-KZ (65%)',
        description: 'Для участия требуется подтвержденное казахстанское происхождение товара с долей не менее 65%.'
      }
    ],
    documents: [
      { id: 'doc-9', fileName: 'ГОСТ_и_спецификация_Казатомпром.pdf', fileUrl: '/docs/kazatomprom_siz.pdf', fileSize: '5.6 MB', fileType: 'pdf' }
    ],
    history: []
  }
];

export const INITIAL_DATA_SOURCES: DataSourceStatus[] = [
  {
    id: 'src-1',
    name: 'GOSZAKUP',
    displayName: 'goszakup.gov.kz (ЕГСЗ РК)',
    adapterType: 'API',
    isActive: true,
    checkIntervalMins: 15,
    lastSyncAt: '2026-07-23T16:15:00Z',
    healthStatus: 'HEALTHY',
    successRate24h: 99.8,
    totalIngested: 14290
  },
  {
    id: 'src-2',
    name: 'SAMRUK_KAZYNA',
    displayName: 'portal.sk.kz (Самрук-Казына)',
    adapterType: 'API',
    isActive: true,
    checkIntervalMins: 30,
    lastSyncAt: '2026-07-23T16:00:00Z',
    healthStatus: 'HEALTHY',
    successRate24h: 99.4,
    totalIngested: 8340
  },
  {
    id: 'src-3',
    name: 'KAZATMROPROM',
    displayName: 'e-procurement.kazatomprom.kz',
    adapterType: 'SCRAPER',
    isActive: true,
    checkIntervalMins: 60,
    lastSyncAt: '2026-07-23T15:30:00Z',
    healthStatus: 'DEGRADED',
    successRate24h: 94.2,
    totalIngested: 1820
  },
  {
    id: 'src-4',
    name: 'B2B_PRIVATE',
    displayName: 'Частные b2b-площадки РК (Фаза 2)',
    adapterType: 'SCRAPER',
    isActive: false,
    checkIntervalMins: 120,
    lastSyncAt: '2026-07-20T12:00:00Z',
    healthStatus: 'DOWN',
    successRate24h: 0.0,
    totalIngested: 450
  }
];

export const KZ_REGIONS = [
  'Все регионы',
  'г. Астана',
  'г. Алматы',
  'г. Шымкент',
  'Акмолинская область',
  'Актюбинская область',
  'Алматинская область',
  'Атырауская область',
  'Восточно-Казахстанская область',
  'Жамбылская область',
  'Западно-Казахстанская область',
  'Карагандинская область',
  'Костанайская область',
  'Кызылординская область',
  'Мангистауская область',
  'Павлодарская область',
  'Северо-Казахстанская область',
  'Туркестанская область',
  'Улытауская область',
  'Абайская область',
  'Жетысуская область'
];

export const CATEGORIES = [
  'Все категории',
  'ИТ и Телекоммуникации',
  'Строительство и Ремонт',
  'ИТ и ПО',
  'Медицина и Фармацевтика',
  'Услуги питания и Кейтеринг',
  'Легкая промышленность и СИЗ',
  'Транспорт и Логистика',
  'Консалтинг и Юриспруденция',
  'Оборудование и Машиностроение'
];
