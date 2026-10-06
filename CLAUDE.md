@AGENTS.md

# Chat History Viewer

Viewer for a Telegram Desktop JSON export: Next.js 16 (App Router), Postgres + Drizzle, Tailwind 4, react-virtuoso. UI copies Telegram's dark "Night" theme; colors live as `--color-tg-*` tokens in `src/app/globals.css`.

## Commands
- `docker compose up -d` — local Postgres 18 on port 5435 (own container, unrelated to other projects)
- `npm run dev` / `npm run build`
- `npx tsc --noEmit && npx eslint src scripts` — run after changes
- `npm run db:generate` after editing `src/db/schema.ts`, then `npm run db:migrate`
- `npm run import -- backup/result.json`, `npm run user:create -- <user> <password>`

## Conventions
- `backup/` holds private chat data: never commit it, never print message contents into logs or docs.
- Every field of the export must be preserved: new export fields get a column in `messages` and a mapping in `scripts/import.ts`; `raw` keeps the original object.
- Pagination is keyset on `(date, id)`, never OFFSET over messages.
- On Postgres 18, `left()`/`substr()` on long TOASTed text returns broken UTF-8: use `left(col || '', n)` (see `safeLeft` in `src/lib/queries.ts`).
- Inside drizzle `sql` subqueries in a select list, reference outer columns explicitly (`"chats"."id"`), interpolated columns render unqualified.
- Browser time zones go through `resolvePgTimeZone` (`src/lib/timezone.ts`): browsers report legacy names like `Europe/Kiev` that Postgres 18 tzdata lacks.
- Next 16: `proxy.ts` replaces middleware; `params` are Promises; route types come from `npx next typegen`.
- UI text is Russian.
