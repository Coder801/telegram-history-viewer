import { sql } from "drizzle-orm";
import { db } from "@/db";

/**
 * Maps a browser time zone to one Postgres knows. Browsers still report legacy names
 * (e.g. "Europe/Kiev") that the Postgres 18 image's tzdata no longer has, so an unknown
 * name is matched to a Postgres zone with identical UTC offsets over the chat's years.
 */

let pgZones: Promise<string[]> | null = null;
const resolved = new Map<string, string | null>();

function loadPgZones() {
  pgZones ??= db
    .execute<{ name: string }>(sql`select name from pg_timezone_names`)
    .then((r) => r.rows.map((row) => row.name))
    .catch((e) => {
      pgZones = null;
      throw e;
    });
  return pgZones;
}

// Two instants per year (winter/summer) across the archive's span and a bit around it.
const SAMPLES = Array.from({ length: 2030 - 2013 }, (_, i) => 2013 + i).flatMap((y) => [
  Date.UTC(y, 0, 15, 12),
  Date.UTC(y, 6, 15, 12),
]);

function offsets(tz: string) {
  try {
    const fmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "longOffset" });
    return SAMPLES.map((t) => fmt.formatToParts(t).find((p) => p.type === "timeZoneName")?.value).join(",");
  } catch {
    return null;
  }
}

export async function resolvePgTimeZone(tz: string): Promise<string | null> {
  if (resolved.has(tz)) return resolved.get(tz)!;
  const zones = await loadPgZones();
  let match: string | null = zones.includes(tz) ? tz : null;
  if (!match) {
    const target = offsets(tz);
    if (target) {
      // Prefer zones in the same region, e.g. Europe/Kiev -> Europe/Kyiv.
      const region = tz.split("/")[0];
      const candidates = [...zones.filter((z) => z.startsWith(`${region}/`)), ...zones.filter((z) => !z.startsWith(`${region}/`))];
      match = candidates.find((z) => offsets(z) === target) ?? null;
    }
  }
  resolved.set(tz, match);
  return match;
}
