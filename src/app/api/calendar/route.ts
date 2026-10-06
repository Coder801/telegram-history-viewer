import { NextResponse, type NextRequest } from "next/server";
import { badRequest, intParam } from "@/lib/api";
import { getCalendarDays, getCalendarMonths } from "@/lib/queries";
import { resolvePgTimeZone } from "@/lib/timezone";

/**
 * GET /api/calendar?chat=<id>&tz=<IANA zone>            → { months: {"2020-01": n}, first, last }
 * GET /api/calendar?chat=<id>&tz=<IANA zone>&month=2020-01 → { days: {"1": n} }
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const chatId = intParam(params, "chat");
  if (chatId === undefined) return badRequest("chat is required");
  const tz = await resolvePgTimeZone(params.get("tz") ?? "UTC");
  if (!tz) return badRequest("unknown tz");

  const month = params.get("month");
  if (month) {
    const match = /^(\d{4})-(\d{2})$/.exec(month);
    if (!match || +match[2] < 1 || +match[2] > 12) return badRequest("month must be YYYY-MM");
    return NextResponse.json({ days: await getCalendarDays(chatId, tz, +match[1], +match[2]) });
  }
  return NextResponse.json(await getCalendarMonths(chatId, tz));
}
