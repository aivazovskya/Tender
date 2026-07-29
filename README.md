# TenderAI — Платформа агрегации тендеров Казахстана с ИИ-ботом

**Версия**: v1.6 (Казахстан)  
**Технологический стек**: Next.js 14 App Router API-First Architecture (`/api/*`), TypeScript, Tailwind CSS, Prisma, PostgreSQL, Telegraf (Telegram Bot), BullMQ & Redis, Google Gemini API.

---

## 🚀 Возможности системы

1. **Агрегация данных (Module 1)**:
   - Коннекторы с двойной архитектурой (`ApiAdapter` / `ScraperAdapter`) для **goszakup.gov.kz** (веб-сервисы ЕГСЗ РК) и **portal.sk.kz** (АО "Самрук-Казына").
   - Фоновые воркеры на базе **BullMQ & Redis** для регулярного инжеста данных по расписанию (`checkIntervalMins`).
   - Реальный `RateLimiter` с алгоритмом Token Bucket и экспоненциальным backoff (2s, 4s, 8s) при 429/5xx ошибках источника.

2. **Нормализация и обогащение (Module 2)**:
   - Единая структура данных: Заказчик, БИН РК, Регион, Сумма KZT, КТРУ/ОКЭД, Обеспечение заявки.
   - ИИ-генерация резюме лотов, требований и оценка риска участия через Google Gemini API с фиксацией расхода токенов в `AiTokenUsage`.

3. **ИИ-Бот & Поиск (Module 3)**:
   - Семантический поиск и матчинг на базе TF-IDF векторизации с учетом географического контекста РК и финансовых ограничений.
   - Ответы на вопросы по техническим спецификациям и квалификационным требованиям лота.

4. **Интерактивный Telegram-Бот (Module 4)**:
   - Отдельный сервис на базе **Telegraf** (`scripts/telegram-bot.ts` / `.js`).
   - Мгновенные push-уведомления и привязка аккаунта через Deep Link `t.me/TenderAI_KZ_bot?start=USER_ID`.
   - Команды `/start`, `/search`, `/profile`, `/digest` в Telegram.

5. **Командная воронка (Kanban - Module 5)**:
   - Этапы: *На рассмотрении* &rarr; *Готовим заявку* &rarr; *Подано в портал* &rarr; *Выиграли лот* &rarr; *Проиграли*.
   - Интерактивный выбор ответственного члена команды и подсчет объема воронки в KZT.

6. **Административная панель (Module 6)**:
   - Мониторинг здоровья адаптеров парсинга, расхода ИИ-токенов (`AiTokenUsage`) и ручной запуск синхронизации через `/api/ingestion`.

7. **Тарифы & Безопасность Kaspi Pay (Module 7)**:
   - Серверная валидация HMAC-SHA256 подписей вебхуков в `/api/billing/kaspi/webhook` с использованием переменной `KASPI_WEBHOOK_SECRET` и поллинг статуса в `/api/billing/kaspi/status` (Free / Pro 29 900 ₸ / Team 69 900 ₸ / Enterprise 199 000 ₸).

---

## 🛠️ Запуск проекта

### 1. Установка зависимостей
```bash
npm install
```

### 2. Заполнение переменными окружения (.env)
Создайте `.env` на основе `.env.example`:
```bash
cp .env.example .env
```
Задайте необходимые значения (`DATABASE_URL`, `REDIS_URL`, `KASPI_WEBHOOK_SECRET`, `TELEGRAM_BOT_TOKEN`, `GEMINI_API_KEY`).

### 3. Применение миграций и сидинг базы данных PostgreSQL
```bash
npx prisma db push
npm run seed
```

### 4. Запуск веб-приложения в режиме разработки
```bash
npm run dev
```
Откройте браузер по адресу: `http://localhost:3000`

### 5. Запуск фоновых сервисов (Воркер и Telegram-бот)
- **BullMQ Ingestion Worker**:
  ```bash
  node scripts/ingestion-worker.js
  ```
- **Telegram Bot**:
  ```bash
  node scripts/telegram-bot.js
  ```

### 6. Запуск через Docker Compose
```bash
docker compose up --build -d
```
Docker Compose поднимет сервисы: `web` (Next.js), `worker` (BullMQ Ingestion), `bot` (Telegram Bot), `db` (PostgreSQL), `redis` (Redis).

---

## 🏗️ Структура проекта

```
Tender/
├── docker-compose.yml        # Docker оркестрация (web, worker, bot, db, redis)
├── prisma/
│   └── schema.prisma         # База данных PostgreSQL (Tender, Source, Company, User, Kanban, Payment, AiTokenUsage)
├── scripts/
│   ├── seed.js               # Скрипт занесения начальных данных в PostgreSQL
│   ├── ingestion-worker.ts   # Исполняемый BullMQ воркер инжеста
│   └── telegram-bot.ts       # Исполняемый сервис Telegram-бота
├── src/
│   ├── app/
│   │   ├── api/              # Серверные REST API контроллеры
│   │   │   ├── tenders/      # Выдача лотов из БД
│   │   │   ├── ingestion/    # Запуск фонового синка источников
│   │   │   ├── billing/      # Каспи платежи и поллинг статуса (HMAC verification)
│   │   │   └── admin/        # Метрики админки и расход токенов
│   │   ├── layout.tsx        # Корневой лейаут с темной темой
│   │   ├── page.tsx          # Главное приложение TenderAI (API-First fetch)
│   │   └── globals.css       # Стили glassmorphic & Tailwind
│   ├── components/
│   │   ├── Navigation.tsx    # Шапка с выбором языков (RU/KK) и тарифом
│   │   ├── TenderCard.tsx    # Карточка тендера с ИИ-суммаризатором и индикатором рисков
│   │   ├── TenderDetailModal.tsx # Модальное окно с RAG-чатом
│   │   ├── KanbanBoard.tsx   # Командная воронка с выбором ответственного
│   │   ├── CompanyProfileModal.tsx # Настройка семантического ИИ-матчинга
│   │   ├── AdminPanel.tsx    # Мониторинг коннекторов и токенов по API
│   │   ├── BillingModal.tsx  # Оплата через Kaspi Pay QR
│   │   └── TelegramBotModal.tsx # Статус интеграции Telegram-бота
│   └── lib/
│       ├── types/            # Доменные типы РК
│       ├── ingestion/        # Адаптеры с RateLimiter и Backoff
│       ├── queue/            # Очереди BullMQ (ingestion.queue.ts)
│       ├── telegram/         # Telegraf Bot сервис и Deep Link генератор
│       ├── services/         # AI Service, Kaspi Service
│       └── mockData.ts       # Тестовый набор тендеров по регионам РК
├── tailwind.config.js
└── package.json
```
