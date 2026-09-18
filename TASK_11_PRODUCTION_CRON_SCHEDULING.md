# Задача 11: Кроны не подключены в проде (P0-3 из ANTIGRAVITY_TASKS.md фактически не закрыт)

Статус: обнаружено 2026-09-18, архитектор (Claude). Исполнитель: архитектор (это серверный конфиг,
не код приложения — не задача для antigravity).

## Находка

`ANTIGRAVITY_TASKS.md`, раздел P0-3, требовал завести планировщик под self-host, потому что
`vercel.json`-кроны работают только на самой платформе Vercel. При проверке текущего состояния VPS
(`87.199.128.36`) в рамках верификации новой фичи мониторинга статусов (`ANTIGRAVITY_TASKS.md §10`)
выяснилось, что P0-3 по факту не был закрыт при первом деплое:

```
$ crontab -l
0 3 * * * /opt/Tender/scripts/backup-db.sh >> /var/log/tender-db-backup.log 2>&1
```

Единственная запись — ежедневный бэкап БД. Ни один из `/api/cron/*`/`/api/notifications/*` эндпоинтов
не вызывается по расписанию. Отдельного контейнера-планировщика в `docker-compose.yml` тоже нет
(`tender_web`, `tender_worker`, `tender_bot`, `tender_postgres`, `tender_redis` — и всё).

**Практическое следствие**: весь код дедлайн-напоминаний (`check-upcoming-deadlines`, уже был описан
в `ANTIGRAVITY_TASKS.md §10.1` как "уже работает в проде" — это было неточно с точки зрения именно
расписания: код рабочий и шлёт Telegram-уведомления корректно, если его вызвать, но сам он никогда не
вызывается) и новый крон мониторинга статусов (`poll-tender-statuses`, §10.2) не срабатывают
автоматически. Пользователи не получают ни дедлайн-напоминания, ни уведомления о смене статуса лота —
несмотря на то, что вся бизнес-логика реализована и протестирована.

## Полный список эндпоинтов из `vercel.json` (актуально на 2026-09-18)

| Эндпоинт | Расписание (из `vercel.json`) | Назначение |
| --- | --- | --- |
| `/api/cron/health-check` | `0 * * * *` (каждый час) | Проверка здоровья источников данных |
| `/api/notifications/check-security-expiry` | `0 8 * * *` (раз в день, 08:00) | Истечение сроков обеспечений заявки/контракта |
| `/api/cron/check-upcoming-deadlines` | `0 7,19 * * *` (дважды в день) | Напоминания о дедлайнах лотов (Telegram) |
| `/api/cron/check-submitted-tender-results` | `0 6,18 * * *` (дважды в день) | Проверка итогов поданных заявок |
| `/api/cron/poll-tender-statuses` | `*/30 * * * *` (каждые 30 мин) | Мониторинг статусов лотов (§10.2, новое) |

Все 5 роутов уже проверяют `X-Cron-Secret`/`?cronSecret=` против `process.env.CRON_SECRET` — авторизация
на стороне приложения не требует изменений, нужен только вызывающий планировщик на хосте.

## Решение

Обёрточный скрипт `scripts/cron-runner.sh`, читающий `CRON_SECRET` из `.env` (чтобы секрет не лежал
в открытом виде в `crontab -l`), + 5 строк в `crontab`, зеркальных `vercel.json`.

### 1. `/opt/Tender/scripts/cron-runner.sh` (создать на сервере)

```bash
#!/bin/bash
# Вызывает один из /api/cron|notifications/* эндпоинтов TenderAI с авторизацией из .env.
# Использование: cron-runner.sh /api/cron/poll-tender-statuses
set -euo pipefail
ENV_FILE="/opt/Tender/.env"
CRON_SECRET=$(grep -E '^CRON_SECRET=' "$ENV_FILE" | head -1 | cut -d'=' -f2- | tr -d '"')

if [ -z "$CRON_SECRET" ]; then
  echo "[cron-runner] CRON_SECRET не найден в $ENV_FILE" >&2
  exit 1
fi

PATH_ARG="$1"
curl -sf -X GET \
  -H "X-Cron-Secret: ${CRON_SECRET}" \
  "http://127.0.0.1:3000${PATH_ARG}" \
  -o /var/log/tender-cron-last-response.json \
  || echo "[cron-runner] Запрос к ${PATH_ARG} завершился с ошибкой" >&2
```

`chmod +x scripts/cron-runner.sh` после создания.

### 2. Записи `crontab` (добавить к существующей записи бэкапа, не заменять её)

```cron
0 * * * * /opt/Tender/scripts/cron-runner.sh /api/cron/health-check >> /var/log/tender-cron.log 2>&1
0 8 * * * /opt/Tender/scripts/cron-runner.sh /api/notifications/check-security-expiry >> /var/log/tender-cron.log 2>&1
0 7,19 * * * /opt/Tender/scripts/cron-runner.sh /api/cron/check-upcoming-deadlines >> /var/log/tender-cron.log 2>&1
0 6,18 * * * /opt/Tender/scripts/cron-runner.sh /api/cron/check-submitted-tender-results >> /var/log/tender-cron.log 2>&1
*/30 * * * * /opt/Tender/scripts/cron-runner.sh /api/cron/poll-tender-statuses >> /var/log/tender-cron.log 2>&1
```

## Критерии приёмки

- [x] `crontab -l` на сервере содержит все 5 новых строк плюс существующий бэкап БД (6 записей всего).
      Выполнено 2026-09-18: 4 эндпоинта подключены сразу, 5-й (`poll-tender-statuses`) добавлен отдельно
      после деплоя `ANTIGRAVITY_TASKS.md §10` фазы 1 (коммит `2dff410`).
- [x] Ручной прогон `scripts/cron-runner.sh /api/cron/health-check` возвращает `200`/`success: true` в
      `/var/log/tender-cron-last-response.json`. Проверено для всех 5 эндпоинтов вручную.
- [ ] Через 30+ минут после установки — `/var/log/tender-cron.log` показывает реальные срабатывания
      `poll-tender-statuses`, без ошибок авторизации. (Ещё не проверено — установлено только что.)
- [ ] Тестовая заявка с дедлайном менее суток — проверить, что `check-upcoming-deadlines` реально
      присылает Telegram-уведомление в следующее плановое срабатывание (07:00 или 19:00), не только
      при ручном вызове.

## Побочная находка при деплое (2026-09-18): сборка Docker падала на Playwright

При первой попытке пересобрать `web`/`worker` с новой схемой выяснилось, что `Dockerfile` был сломан:
стадия `base` делает `rm -rf /var/lib/apt/lists/*` (строка 3), а унаследованная от неё стадия `runner`
позже пытается `npx playwright install --with-deps chromium`, которому нужен `apt-get install` — но
кеш списка пакетов уже вычищен, apt не может найти ни один пакет (`Unable to locate package
xfonts-scalable` и т.д.). Раньше это скрывалось Docker-кешем слоёв (playwright-слой не пересобирался
между деплоями); в этот раз пересборка кеш инвалидировала и баг вскрылся. Исправлено добавлением
`apt-get update` непосредственно перед `playwright install` в стадии `runner` — задеплоено, пересборка
прошла успешно, простоя не было (старые контейнеры продолжали работать до успешной пересборки).

## Открытый риск, не закрываемый этой задачей

Полученные записи `poll-tender-statuses` для тендеров источника `GOSZAKUP` зависят от
`fetchBuyResult()` (`src/lib/ingestion/goszakup.adapter.ts:182`), который запрашивает неподтверждённое
поле `TrdBuyItogi` — см. `ANTIGRAVITY_TASKS.md §6`, задача 2. Подключение крона не делает эти статусы
достовернее — без `GOSZAKUP_API_TOKEN` и сверки с реальным ответом API это отдельный, не закрытый риск.
