import { NextResponse, type NextRequest } from "next/server";
import { badRequest, intParam } from "@/lib/api";
import { findMessageIdByDate, getMessages } from "@/lib/queries";

/**
 * GET /api/messages?chat=<id>[&before=<msgId>|&after=<msgId>|&around=<msgId>|&date=<ISO>][&limit=50]
 * Without a cursor returns the latest page.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const chatId = intParam(params, "chat");
  if (chatId === undefined) return badRequest("chat is required");

  let around = intParam(params, "around");
  const date = params.get("date");
  if (date) {
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) return badRequest("invalid date");
    const found = await findMessageIdByDate(chatId, parsed);
    if (found === null) return NextResponse.json({ messages: [], hasOlder: false, hasNewer: false, anchor: null });
    around = found;
  }

  const page = await getMessages(chatId, {
    before: intParam(params, "before"),
    after: intParam(params, "after"),
    around,
    limit: intParam(params, "limit"),
  });
  return NextResponse.json({ ...page, anchor: around ?? null });
}
