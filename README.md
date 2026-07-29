# TenderAI — Платформа агрегации тендеров Казахстана с ИИ-ботом

**Версия**: v1.6 (Казахстан)  
**Технологический стек**: Next.js 14 App Router API-First Architecture (`/api/*`), TypeScript, Tailwind CSS, Prisma, PostgreSQL + pgvector, Telegraf (Telegram Bot), BullMQ & Redis.

---

## 🚀 Возможности системы

1. **Агрегация данных (Module 1)**:
   - Коннекторы с двойной архитектурой (`ApiAdapter` / `ScraperAdapter`) для **goszakup.gov.kz** (веб-сервисы ЕГСЗ РК) и **portal.sk.kz** (АО "Самрук-Казына").
   - Реальный `RateLimiter` с алгоритмом Token Bucket и экспоненциальным backoff (2s, 4s, 8s) при 429/5xx ошибках источника.

2. **Нормализация и обогащение (Module 2)**:
   - Единая структура данных: Заказчик, БИН РК, Регион, Сумма KZT, КТРУ/ОКЭД, Обеспечение заявки.
   - Оценка формальных рисков (короткие дедлайны, отмены конкурсов заказчиком).

3. **ИИ-Бот & Фактологический RAG (Module 3)**:
   - Документарно-привязанный RAG без галлюцинаций: ответы формируются строго по техническим спецификациям лота.
   - Персональный семантический матчинг под профиль компании.

4. **Интерактивный Telegram-Бот (Module 4)**:
   - Мгновенные push-уведомления и привязка аккаунта через Deep Link `t.me/TenderAI_KZ_bot?start=USER_ID`.
   - Команды `/search`, `/profile`, `/digest` в Telegram.

5. **Командная воронка (Kanban - Module 5)**:
   - Этапы: *На рассмотрении* &rarr; *Готовим заявку* &rarr; *Подано в портал* &rarr; *Выиграли лот* &rarr; *Проиграли*.
   - Интерактивный выбор ответственного члена команды и подсчет объема воронки в KZT.

6. **Административная панель (Module 6)**:
   - Мониторинг здоровья адаптеров парсинга, расхода ИИ-токенов и ручной запуск синхронизации через `/api/ingestion`.

7. **Тарифы & Безопасность Kaspi Pay (Module 7)**:
   - Серверная валидация подписей вебхуков в `/api/billing/kaspi/webhook` и поллинг статуса в `/api/billing/kaspi/status` (Free / Pro 29 900 ₸ / Team 69 900 ₸ / Enterprise 199 000 ₸).

---

## 🛠️ Запуск проекта

### 1. Установка зависимостей
```bash
npm install
```

### 2. Сидинг базы данных PostgreSQL
```bash
npm run seed
```

### 3. Запуск в режиме разработки
```bash
npm run dev
```
Откройте браузер по адресу: `http://localhost:3000`

---

## 🏗️ Структура проекта

```
Tender/
├── prisma/
│   └── schema.prisma         # База данных PostgreSQL (Tender, Source, Company, User, Kanban, Payment, AiTokenUsage)
├── scripts/
│   └── seed.js               # Скрипт занесения начальных данных в PostgreSQL
├── src/
│   ├── app/
│   │   ├── api/              # Серверные REST API контроллеры
│   │   │   ├── tenders/      # Выдача лотов из БД
│   │   │   ├── ingestion/    # Запуск фонового синка источников
│   │   │   ├── billing/      # Каспи платежи и поллинг статуса
│   │   │   └── admin/        # Метрики админки и расход токенов
│   │   ├── layout.tsx        # Корневой лейаут с темной темой
│   │   ├── page.tsx          # Главное приложение TenderAI (API-First fetch)
│   │   └── globals.css       # Стили glassmorphic & Tailwind
│   ├── components/
│   │   ├── Navigation.tsx    # Шапка с выбором языков (RU/KK) и тарифом
│   │   ├── TenderCard.tsx    # Карточка тендера с ИИ-суммаризатором и индикатором рисков
│   │   ├── TenderDetailModal.tsx # Модальное окно с фактологическим RAG-чатом
│   │   ├── KanbanBoard.tsx   # Командная воронка с выбором ответственного
│   │   ├── CompanyProfileModal.tsx # Настройка семантического ИИ-матчинга
│   │   ├── AdminPanel.tsx    # Мониторинг коннекторов и токенов по API
│   │   ├── BillingModal.tsx  # Оплата через Kaspi Pay QR
│   │   └── TelegramBotModal.tsx # Статус интеграции Telegram-бота
│   └── lib/
│       ├── types/            # Доменные типы РК
│       ├── ingestion/        # Адаптеры с RateLimiter и Backoff
│       ├── telegram/         # Telegraf Bot сервис и Deep Link генератор
│       ├── services/         # AI Service, Kaspi Service
│       └── mockData.ts       # Тестовый набор тендеров по регионам РК
├── tailwind.config.js
└── package.json
```
