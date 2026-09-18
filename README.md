# Backend Foundation Intensive — учебный репозиторий

Этот репозиторий — рабочее окружение для интенсива Day 0–7.

Главный принцип: **репозиторий не решает учебные задания за тебя**.
Таблицы, связи, constraints, индексы и migrations создаёт ученик.
Готовые seeders только:
- проверяют ожидаемую schema;
- наполняют БД воспроизводимыми fake-данными;
- создают специальные сценарии для практики.

## Быстрый старт

```bash
copy .env.example .env
npm install
docker compose up -d
npm run dev
```

Проверка:
- API: http://localhost:3000/health
- Adminer: http://localhost:8080
- PostgreSQL: localhost:5432
- Redis: localhost:6379

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
