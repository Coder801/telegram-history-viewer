import { and, asc, desc, eq, getTableColumns, sql, type SQL } from "drizzle-orm";
import { alias, type AnyPgColumn } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { chats, messages } from "@/db/schema";
import type { ChatDto, MessageDto, MessagesPage, ReactionDto, SearchHit } from "./types";

/** In a personal chat export the chat id is the other person's user id. */
export const peerIdOf = (chatId: number) => `user${chatId}`;

const reply = alias(messages, "reply");

/**
 * left() that is safe for long Cyrillic text: on Postgres 18 left()/substr() over a
 * compressed TOAST value can return a broken UTF-8 sequence. `|| ''` detoasts fully first.
 */
const safeLeft = (column: AnyPgColumn, n: number) =>
  sql<string | null>`left(${column} || '', ${sql.raw(String(n))})`;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { raw, chatId: _chatId, ...messageColumns } = getTableColumns(messages);

const reactionsJson = sql<ReactionDto[]>`coalesce((
  select json_agg(json_build_object('type', r.type, 'emoji', r.emoji, 'count', r.count) order by r.position)
  from reactions r
  where r.chat_id = ${messages.chatId} and r.message_id = ${messages.id}
), '[]'::json)`;

function selectMessages() {
  return db
    .select({
      ...messageColumns,
      reactions: reactionsJson,
      replyId: reply.id,
      replyFromName: reply.fromName,
      replyText: safeLeft(reply.textPlain, 200),
      replyMediaType: reply.mediaType,
      replyPhotoSize: reply.photoFileSize,
      replyStickerEmoji: reply.stickerEmoji,
    })
    .from(messages)
    .leftJoin(reply, and(eq(reply.chatId, messages.chatId), eq(reply.id, messages.replyToMessageId)))
    .$dynamic();
}

type Row = Awaited<ReturnType<ReturnType<typeof selectMessages>["execute"]>>[number];

function toDto(row: Row, chatId: number): MessageDto {
  const {
    replyId, replyFromName, replyText, replyMediaType, replyPhotoSize, replyStickerEmoji,
    date, edited, ...rest
  } = row;
  const author = rest.fromId ?? rest.actorId;
  return {
    ...rest,
    date: date.toISOString(),
    edited: edited?.toISOString() ?? null,
    out: author !== null && author !== peerIdOf(chatId),
    reply:
      replyId === null
        ? null
        : {
            id: replyId,
            fromName: replyFromName,
            text: replyText ?? "",
            mediaType: replyMediaType,
            hasPhoto: replyPhotoSize !== null,
            stickerEmoji: replyStickerEmoji,
          },
  };
}

/** (date, id) of a message: the keyset cursor used for pagination. */
const cursorOf = (chatId: number, id: number) =>
  sql`(select m2.date, m2.id from messages m2 where m2.chat_id = ${chatId} and m2.id = ${id})`;

async function fetchSide(chatId: number, cond: SQL | undefined, direction: "older" | "newer", limit: number) {
  const rows = await selectMessages()
    .where(and(eq(messages.chatId, chatId), cond))
    .orderBy(
      ...(direction === "older"
        ? [desc(messages.date), desc(messages.id)]
        : [asc(messages.date), asc(messages.id)]),
    )
    .limit(limit + 1);
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit).map((r) => toDto(r, chatId));
  if (direction === "older") page.reverse();
  return { page, hasMore };
}

export async function getMessages(
  chatId: number,
  opts: { before?: number; after?: number; around?: number; limit?: number },
): Promise<MessagesPage> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const tuple = sql`(${messages.date}, ${messages.id})`;

  if (opts.around !== undefined) {
    const half = Math.ceil(limit / 2);
    const [older, newer] = await Promise.all([
      fetchSide(chatId, sql`${tuple} <= ${cursorOf(chatId, opts.around)}`, "older", half),
      fetchSide(chatId, sql`${tuple} > ${cursorOf(chatId, opts.around)}`, "newer", half),
    ]);
    return { messages: [...older.page, ...newer.page], hasOlder: older.hasMore, hasNewer: newer.hasMore };
  }
  if (opts.after !== undefined) {
    const { page, hasMore } = await fetchSide(chatId, sql`${tuple} > ${cursorOf(chatId, opts.after)}`, "newer", limit);
    return { messages: page, hasOlder: true, hasNewer: hasMore };
  }
  const cond = opts.before !== undefined ? sql`${tuple} < ${cursorOf(chatId, opts.before)}` : undefined;
  const { page, hasMore } = await fetchSide(chatId, cond, "older", limit);
  return { messages: page, hasOlder: hasMore, hasNewer: opts.before !== undefined };
}

/** First message on or after the given moment; null when there is none (e.g. a future date). */
export async function findMessageIdByDate(chatId: number, date: Date): Promise<number | null> {
  const [atOrAfter] = await db
    .select({ id: messages.id })
    .from(messages)
    .where(and(eq(messages.chatId, chatId), sql`${messages.date} >= ${date.toISOString()}`))
    .orderBy(asc(messages.date), asc(messages.id))
    .limit(1);
  return atOrAfter?.id ?? null;
}

/** Message counts per "YYYY-MM" in the viewer's time zone, plus the overall date range. */
export async function getCalendarMonths(chatId: number, timeZone: string) {
  const local = sql`(${messages.date} at time zone ${timeZone})`;
  const rows = await db
    .select({ month: sql<string>`to_char(${local}, 'YYYY-MM')`, count: sql<number>`count(*)::int` })
    .from(messages)
    .where(eq(messages.chatId, chatId))
    .groupBy(sql`1`);
  const [range] = await db
    .select({ first: sql<Date>`min(${messages.date})`, last: sql<Date>`max(${messages.date})` })
    .from(messages)
    .where(eq(messages.chatId, chatId));
  return {
    months: Object.fromEntries(rows.map((r) => [r.month, r.count])) as Record<string, number>,
    first: range?.first ? new Date(range.first).toISOString() : null,
    last: range?.last ? new Date(range.last).toISOString() : null,
  };
}

/** Message counts per day of the given month, in the viewer's time zone. */
export async function getCalendarDays(chatId: number, timeZone: string, year: number, month: number) {
  const start = sql`(make_timestamp(${year}, ${month}, 1, 0, 0, 0) at time zone ${timeZone})`;
  const end = sql`((make_timestamp(${year}, ${month}, 1, 0, 0, 0) + interval '1 month') at time zone ${timeZone})`;
  const rows = await db
    .select({
      day: sql<number>`extract(day from ${messages.date} at time zone ${timeZone})::int`,
      count: sql<number>`count(*)::int`,
    })
    .from(messages)
    .where(and(eq(messages.chatId, chatId), sql`${messages.date} >= ${start}`, sql`${messages.date} < ${end}`))
    .groupBy(sql`1`);
  return Object.fromEntries(rows.map((r) => [r.day, r.count])) as Record<number, number>;
}

export async function searchMessages(chatId: number, query: string, offset = 0, limit = 50): Promise<SearchHit[]> {
  const pattern = `%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const rows = await db
    .select({
      id: messages.id,
      date: messages.date,
      fromName: messages.fromName,
      fromId: messages.fromId,
      text: messages.textPlain,
    })
    .from(messages)
    .where(and(eq(messages.chatId, chatId), sql`${messages.textPlain} ilike ${pattern}`))
    .orderBy(desc(messages.date), desc(messages.id))
    .limit(limit)
    .offset(offset);
  return rows.map((r) => ({
    id: r.id,
    date: r.date.toISOString(),
    fromName: r.fromName,
    out: r.fromId !== null && r.fromId !== peerIdOf(chatId),
    text: r.text,
  }));
}

// Subqueries reference "chats"."id" explicitly: drizzle renders ${chats.id} unqualified
// inside a select list, which would bind to messages.id.
export async function getChats(): Promise<ChatDto[]> {
  const rows = await db
    .select({
      id: chats.id,
      name: chats.name,
      type: chats.type,
      messageCount: sql<number>`(select count(*)::int from messages m where m.chat_id = "chats"."id")`,
      last: sql<{ text: string; date: string; media_type: string | null } | null>`(
        select json_build_object('text', left(m.text_plain || '', 100), 'date', m.date, 'media_type', m.media_type)
        from messages m where m.chat_id = "chats"."id"
        order by m.date desc, m.id desc limit 1
      )`,
    })
    .from(chats)
    .orderBy(asc(chats.name));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type,
    peerId: peerIdOf(r.id),
    messageCount: r.messageCount,
    lastMessage: r.last
      ? { text: r.last.text, date: new Date(r.last.date).toISOString(), mediaType: r.last.media_type }
      : null,
  }));
}

export async function getChat(chatId: number): Promise<ChatDto | null> {
  return (await getChats()).find((c) => c.id === chatId) ?? null;
}
