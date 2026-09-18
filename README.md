# Backend Foundation Intensive — учебный репозиторий

Этот репозиторий — рабочее окружение для интенсива Day 0–7.

Главный принцип: **репозиторий не решает учебные задания за тебя**.
Таблицы, связи, constraints, индексы и migrations создаёт ученик.
Готовые seeders только:
- проверяют ожидаемую schema;
- наполняют БД воспроизводимыми fake-данными;
- создают специальные сценарии для практики.

## Первое задание — развернуть учебное окружение

Установи Git, Node.js 24 и Docker Desktop с Docker Compose. Запусти Docker Desktop. На Windows выбери PowerShell; на macOS/Linux — обычный терминал. Используй отдельную папку, не существующий рабочий проект.

Клонирование создаёт локальную копию проекта. Для чтения публичного репозитория GitHub-аккаунт и `gh auth login` не нужны.

```bash
git clone https://github.com/VladyTipler/backend-foundation-intensive.git job-tracker
cd job-tracker
```

Создай `.env` из `.env.example`: в PowerShell `Copy-Item .env.example .env`, на macOS/Linux `cp .env.example .env`. Делай это только при первом запуске, не перезаписывай свой настроенный `.env`.

Дальше в этой же папке:

```bash
npm ci
docker compose up -d --wait
docker compose ps
npm run db:check
docker compose exec redis redis-cli ping
npm run typecheck
npm run dev
```

`npm ci` ставит версии из `package-lock.json`. `up -d --wait` запускает контейнеры и ждёт их готовности. `db:check` проверяет подключение; отсутствие таблиц до Дня 1 нормально. Redis должен ответить `PONG`.

Открой http://localhost:3000/health: ожидается JSON со `status: "ok"` и `databaseTime`. Открой http://localhost:8080: система PostgreSQL, сервер `postgres`, пользователь `app`, пароль `app`, база `job_tracker`.

Порт API — 3000, PostgreSQL — 5432, Redis — 6379, Adminer — 8080. В `.env` Node использует `localhost`, а Adminer внутри Docker — имя сервиса `postgres`. Пароль `app` предназначен только для локальной учебной среды. Не подставляй production DATABASE_URL.

Готово, если API вернул время из БД, Redis ответил `PONG`, а typecheck завершился без ошибок. `Ctrl+C` останавливает API; `docker compose stop` останавливает контейнеры без удаления данных. Для повторного запуска: `docker compose up -d --wait`, затем `npm run dev`.

Не запускай `npm init` и не переписывай готовые файлы из урока: они уже в репозитории. Таблицы, колонки и миграции создавай самостоятельно по заданиям. Seeders запускай только после создания нужной структуры; они очищают существующие учебные данные, в том числе зависимые строки через CASCADE.

Если порт занят, не завершай чужой процесс наугад: измени левый порт в `docker-compose.yml` и соответствующий адрес в `.env`. PostgreSQL 18 использует volume `/var/lib/postgresql`; не меняй этот путь на старый `/var/lib/postgresql/data` (см. [официальное описание образа](https://github.com/docker-library/docs/blob/master/postgres/README.md)). Для диагностики: `docker compose logs --tail 50 postgres`.

**Важно:** `"private": true` в `package.json` запрещает случайную публикацию npm-пакета. К публичности GitHub-репозитория это поле не относится.

## Готовый frontend — Job Tracker Lab

В `web/` уже есть интерфейс: вакансии, поиск, страницы, создание/редактирование/удаление, аккаунт, отклики и экспорт. Верстать ничего не надо — реализуй backend по [API-контракту](docs/api-contract.md).

Backend оставь работать в первом терминале (`npm run dev`). Открой второй терминал **в корне того же проекта**:

```bash
npm run web:install
npm run web:dev
```

Открой `http://127.0.0.1:5173`. `web:install` выполняется один раз и после обновления зависимостей; `web:dev` — каждое занятие. В `web/` отдельный lock-файл; корневого `npm ci` для frontend недостаточно.
В меню выбери день: 0–1 — проверка `/health`; 2 — вакансии; 3 — аккаунт и отклики; 4–7 — весь интерфейс, включая экспорт. Панель «Под капотом» показывает реальные запросы и ответы, скрывая данные авторизации.
**Готовый интерфейс не означает готовый backend:** в starter реализован только `/health`. До написания нужного endpoint ответ 404 нормален. Демоданных и незаметных подмен нет. Сохранение показывается только после подтверждения сервера.
Для auth выбран путь с серверной сессией и CSRF-токеном. Объект API можно собирать из любой своей реляционной модели — интерфейс не решает задания по таблицам/миграциям вместо тебя.
`Ctrl+C` останавливает frontend в его терминале. Для повторного запуска оставь API работающим и выполни `npm run web:dev`.
Сборка: `npm run web:build`. Подробности адресов, CORS, браузерных тестов и деплоя — в [web/README.md](web/README.md). [Отчёт проверки](docs/frontend-validation.md) отдельно указывает, что тестирует клиент, а не backend ученика.

## Seeders

После того как **самостоятельно создал нужную schema**:

```bash
npm run seed:base
npm run seed:day1:indexes
npm run seed:scenario:n-plus-one
```
## Что делают команды

### `npm run seed:base`
Ожидает:
- `users(id, email, name)`
- `jobs(id, title, company, created_by, created_at)`
- `applications(id, user_id, job_id, status, created_at)`

Создаёт детерминированный dataset:
- 100 users
- 1000 jobs
- 300 applications

### `npm run seed:day1:indexes`
Ожидает `users` и `jobs`.
Создаёт 200 000 jobs, из которых около 1% — Google.
Это позволяет нормально сравнивать `Seq Scan` и `Index Scan`.

### `npm run seed:scenario:n-plus-one`
Создаёт 20 authors и 100 jobs.
Используй ORM query logging, чтобы увидеть N+1, а затем исправить его.

## Очистка БД

```bash
npm run db:clean
```

Удаляет данные из известных учебных таблиц, но сохраняет schema.

Полный ядерный reset:

```bash
npm run db:reset -- --yes
```

Он удаляет schema `public` целиком. После этого свои таблицы/migrations нужно создать заново.
