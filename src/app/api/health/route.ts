import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/health — public, for Railway and debugging. Reports configuration state only,
 * never secrets or chat contents.
 */
export async function GET() {
  const secret = process.env.SESSION_SECRET ?? "";
  const checks: Record<string, unknown> = {
    databaseUrl: !!process.env.DATABASE_URL,
    sessionSecret: secret.length >= 32 ? "ok" : secret ? "too short (min 32 chars)" : "missing",
  };

  try {
    // Check existence first: counting a missing table fails at parse time.
    const { rows } = await db.execute<Record<string, string | null>>(sql`
      select to_regclass('public.users')::text as users,
             to_regclass('public.chats')::text as chats,
             to_regclass('drizzle.__drizzle_migrations')::text as migrations
    `);
    checks.database = "ok";
    for (const [name, table] of Object.entries(rows[0])) {
      checks[name] = table
        ? (await db.execute<{ n: number }>(sql`select count(*)::int as n from ${sql.raw(table)}`)).rows[0].n
        : "table missing";
    }
  } catch (err) {
    checks.database = `error: ${(err as Error & { cause?: Error }).cause?.message ?? (err as Error).message}`;
  }

  const ok = checks.database === "ok" && checks.sessionSecret === "ok" && typeof checks.users === "number" && checks.users > 0;
  return NextResponse.json({ ok, ...checks }, { status: ok ? 200 : 503 });
}
