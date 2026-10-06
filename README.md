# Chat History Viewer

Просмотр архива переписки Telegram (экспорт Telegram Desktop в JSON) в интерфейсе, похожем на Telegram, с тёмной темой.

Next.js 16 · PostgreSQL · Drizzle ORM · Tailwind 4 · react-virtuoso

## Локальный запуск

```bash
cp .env.example .env              # и поставь свой SESSION_SECRET: openssl rand -base64 32
docker compose up -d              # отдельный Postgres 18 на localhost:5435
npm install
npm run db:migrate                # создать таблицы
npm run user:create -- admin 123456789
npm run import -- backup/result.json
npm run dev                       # http://localhost:3000
```

Импорт идемпотентный: повторный запуск или более свежий экспорт того же чата обновит сообщения без дублей.

## Медиа

В текущем экспорте файлов нет, вместо путей там стоит `(File not included...)`, поэтому UI показывает заглушки
с размером и типом. Под ссылки на медиа в базе есть колонки `photo_url`, `file_url` и `thumbnail_url`.
Если сделать экспорт с медиа и залить папку экспорта в хранилище (S3, R2, Railway Bucket), импорт проставит абсолютные ссылки:

```bash
npm run import -- path/to/result.json --media-base-url=https://my-bucket.example.com/export
```

Картинки по ссылкам в тексте сообщений загружаются через `/api/img`. Этот серверный прокси решает три задачи:
обходит mixed content для `http://`, обходит защиту от хотлинка и не пускает запросы во внутренние адреса.

## Деплой на Railway

1. Создай проект и добавь в него **PostgreSQL**.
2. Добавь сервис из этого репозитория. Сборку, миграции перед деплоем и старт описывает `railway.json`.
3. Задай переменные сервиса:
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`
   - `SESSION_SECRET` = результат `openssl rand -base64 32`
4. Перенеси данные одним из двух способов. Строку подключения возьми из вкладки Postgres → Connect → *Public network*.
   - Восстановить локальную базу из дампа (быстрее всего):
     ```bash
     DATABASE_URL=postgres://chat:chat@localhost:5435/chat_history npm run db:dump
     pg_restore --no-owner --clean --if-exists -d "<railway public url>" chat_history.dump
     ```
   - Или импортировать заново прямо в Railway:
     ```bash
     DATABASE_URL="<railway public url>" npm run user:create -- admin <пароль>
     DATABASE_URL="<railway public url>" npm run import -- backup/result.json
     ```

## Экспорт базы

```bash
npm run db:dump      # pg_dump из $DATABASE_URL в chat_history.dump
```

## Структура

| Путь | Что там |
|---|---|
| `src/db/schema.ts` | схема БД: все поля экспорта + `raw` jsonb с исходным объектом |
| `scripts/import.ts` | импорт `result.json` |
| `scripts/create-user.ts` | создание пользователя или смена пароля |
| `src/lib/queries.ts` | выборки: keyset-пагинация, поиск (pg_trgm), переход к дате |
| `src/app/api/*` | `messages`, `search`, `img` (прокси картинок) |
| `src/components/*` | UI: лента, пузыри сообщений, медиа-заглушки, поиск |
| `src/proxy.ts` | проверка сессии (JWT в httpOnly cookie) |
