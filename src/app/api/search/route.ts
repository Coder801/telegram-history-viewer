import { NextResponse, type NextRequest } from "next/server";
import { badRequest, intParam } from "@/lib/api";
import { searchMessages } from "@/lib/queries";

/** GET /api/search?chat=<id>&q=<text>[&offset=0] */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const chatId = intParam(params, "chat");
  const q = params.get("q")?.trim() ?? "";
  if (chatId === undefined) return badRequest("chat is required");
  if (q.length < 2) return NextResponse.json({ hits: [] });

  const hits = await searchMessages(chatId, q, intParam(params, "offset") ?? 0);
  return NextResponse.json({ hits });
}
