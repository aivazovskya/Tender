# TenderAI — Платформа агрегации тендеров Казахстана с ИИ-ботом

**Версия**: v1.6 (Казахстан)  
**Технологический стек**: Next.js 14 App Router API-First Architecture (`/api/*`), TypeScript, Tailwind CSS, Prisma, PostgreSQL (TF-IDF Vector Search Engine), Telegraf (Telegram Bot), BullMQ & Redis, Google Gemini API.

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
   - Семантический векторный поиск и матчинг на базе TF-IDF косинусного сходства с учетом географического контекста РК и финансовых ограничений.
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
> **ВАЖНО**: Для предотвращения случайного запуска в продакшене с дефолтными секретами, `docker-compose.yml` содержит строгую валидацию переменных окружения. Перед вызовом `docker compose up` **обязательно** создайте файл `.env` с заполненными переменными `POSTGRES_PASSWORD`, `DATABASE_URL` и `KASPI_WEBHOOK_SECRET`. Без этих переменных запуск контейнеров намеренно блокируется с ошибкой конфигурации.

```bash
cp .env.example .env
# Отредактируйте .env и установите свой пароль POSTGRES_PASSWORD и секрет KASPI_WEBHOOK_SECRET
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

---

## 🛡️ Безопасность: CI-Guard изоляции клиентских компонентов

В проекте установлен автоматический статический анализатор (`scripts/check-client-secrets.js`), предотвращающий утечки серверных секретов и прямых обращений к Prisma в клиентские компоненты (`'use client'`).

### Прецеденты и причины создания
Ранее в процессе аудита были зафиксированы утечки серверного контекста на клиент:
- **Баг №20**: Прямой вызов серверного сервиса из `TenderDetailModal`, читавшего секреты из `process.env`.
- **Баг №25**: Вызов `TelegramBotService.sendNotification` напрямую из клиентского компонента (`page.tsx`), что приводило к обращению к `TELEGRAM_BOT_TOKEN` в браузере и молчаливому сбою.

### Правила проверки (CI Guard)
1. Любой файл с директивой `'use client'` (прямо или транзитивно по цепочке импортов до 5 уровней) **НЕ должен**:
   - Импортировать `@/lib/prisma` или клиент Prisma (`@prisma/client`).
   - Читать переменные окружения `process.env.*`, содержащие `SECRET`, `TOKEN` или `KEY`.
2. **Исключения**:
   - Переменные с префиксом `NEXT_PUBLIC_*` разрешены и игнорируются guard'ом.
   - Для точечного отключения проверки используйте комментарий в коде:
     ```typescript
     // ci-guard-ignore: <причина>
     ```

### Запуск проверки локально
```bash
npm run check:client-secrets
```
Проверка автоматически выполняется при вызове `npm test` и в CI-пайплайне (`.github/workflows/ci.yml`).

---

## 🔌 Как добавить новый API-источник

Для источников типа `API` (официальные веб-сервисы госзакупок РК, корпоративные порталы) добавление нового коннектора выполняется по следующему алгоритму:

1. **Создание адаптера**:
   Создайте файл `src/lib/ingestion/<name>.adapter.ts`, унаследуйте класс от `BaseTenderAdapter` и реализуйте методы `fetchRawData()` и `normalize()`:
   ```typescript
   import { BaseTenderAdapter } from './base.adapter';
   import { Tender } from '../types/tender';

   export class CustomPortalApiAdapter extends BaseTenderAdapter {
     protected sourceType = 'CUSTOM_PORTAL';
     protected adapterType = 'API' as const;

     async fetchRawData(): Promise<any[]> {
       // Получение данных по HTTP REST/GraphQL или использование fallback при отсутствии ключа
       return [];
     }

     normalize(rawData: any[]): Tender[] {
       // Приведение к единой структуре Tender
       return [];
     }
   }
   ```

2. **Регистрация в реестре адаптеров**:
   Зарегистрируйте новый класс в `src/lib/ingestion/adapter-registry.ts`:
   ```typescript
   import { CustomPortalApiAdapter } from './custom-portal.adapter';

   const API_ADAPTER_REGISTRY: Record<string, AdapterConstructor> = {
     GOSZAKUP: GoszakupApiAdapter,
     SAMRUK_KAZYNA: SamrukApiAdapter,
     CUSTOM_PORTAL: CustomPortalApiAdapter, // Регистрация одной строкой
   };
   ```

3. **Переменные окружения (.env)**:
   Добавьте ключ API в `.env.example` (например `CUSTOM_PORTAL_API_TOKEN`) и предусмотрите в адаптере graceful fallback на демо-данные при отсутствии токена.

4. **Регистрация записи в БД**:
   Заведите запись `DataSource` в базе данных (через `npm run seed` или панель администрирования по кнопке `+ API-источник`), указав поле `name`, совпадающее с ключом реестра (`CUSTOM_PORTAL`).

---

## 🔑 Публичный REST API v1 (тариф Enterprise)

Подписчикам тарифа **Enterprise (199 000 ₸/мес)** доступен программный REST API для интеграции тендерной воронки и каталога с внешними системами учета (1С:Управление торговлей, CRM Битрикс24, amoCRM, SAP, ERP).

### Формат авторизации
Все запросы к публичным эндпоинтам требуют передачи API-ключа в заголовке запроса:
```http
x-api-key: tnd_ai_a1b2c3d4e5f6...
```
или через схему HTTP Bearer Authorization:
```http
Authorization: Bearer tnd_ai_a1b2c3d4e5f6...
```

### Доступные эндпоинты

| Метод | Эндпоинт | Описание |
|---|---|---|
| `GET` | `/api/public/v1/tenders` | Получить отфильтрованный список лотов (параметры: `region`, `category`, `source`, `minAmount`, `maxAmount`, `q`) |
| `GET` | `/api/public/v1/tenders/{id}` | Получить полные детали лота по ID или `externalId` |
| `GET` | `/api/public/v1/kanban` | Получить карточки воронки Kanban текущего аккаунта |
| `POST` | `/api/public/v1/kanban` | Создать или обновить этап, приоритет, заметки и ответственного карточки из 1С/CRM |

### Пример cURL-запроса
```bash
curl -X GET "https://tender-ai.kz/api/public/v1/tenders?region=%D0%B3.+%D0%90%D1%81%D1%82%D0%B0%D0%BD%D0%B0&minAmount=5000000" \
     -H "x-api-key: tnd_ai_9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c" \
     -H "Content-Type: application/json"
```

### Коды ответов
- `200 OK` — Запрос выполнен успешно.
- `401 Unauthorized` — Неверный, отозванный API-ключ или отсутствие подписки Enterprise.
- `403 Forbidden` — Недостаточно прав для выполнения действия.
- `404 Not Found` — Запрашиваемый ресурс (тендер/карточка) не найден.
