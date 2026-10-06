/**
 * Imports a Telegram Desktop export (single chat, JSON format) into Postgres.
 *
 *   npm run import -- backup/result.json [--media-base-url=https://bucket.example.com/export]
 *
 * Idempotent: messages are upserted by (chat_id, id), so a newer export of the same
 * chat can be imported on top of an older one.
 *
 * --media-base-url turns relative media paths from an export made *with* media
 * (e.g. "photos/photo_1@26-05-2017.jpg") into absolute URLs.
 */
import "dotenv/config";
import { readFile } from "node:fs/promises";
import { getTableColumns, sql, inArray, and, eq } from "drizzle-orm";
import { db } from "../src/db";
import { chats, messages, peers, reactions } from "../src/db/schema";

type RawMessage = Record<string, unknown> & {
  id: number;
  type: string;
  date_unixtime: string;
  text: string | (string | { type: string; text: string })[];
  text_entities: { type: string; text: string }[];
};

type RawChat = { name?: string; type: string; id: number; messages: RawMessage[] };

const BATCH = 1000;

// Every key we map to a column. Anything else still lands in `raw`, we just warn about it.
const KNOWN_KEYS = new Set([
  "id", "type", "date", "date_unixtime", "edited", "edited_unixtime", "from", "from_id",
  "text", "text_entities", "reply_to_message_id", "reply_to_peer_id", "forwarded_from",
  "forwarded_from_id", "saved_from", "via_bot", "media_type", "mime_type", "file", "file_name",
  "file_size", "photo", "photo_file_size", "thumbnail", "thumbnail_file_size", "width", "height",
  "duration_seconds", "sticker_emoji", "media_spoiler", "self_destruct_period_seconds", "action",
  "actor", "actor_id", "discard_reason", "message_id", "emoticon", "poll", "location_information",
  "live_location_period_seconds", "place_name", "address", "contact_information",
  "inline_bot_buttons", "reactions",
]);

function parseArgs() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith("--")) ?? "backup/result.json";
  const base = args.find((a) => a.startsWith("--media-base-url="))?.split("=").slice(1).join("=");
  return { file, mediaBaseUrl: base?.replace(/\/+$/, "") };
}

/** Telegram writes "(File not included...)" etc. instead of a path when media is missing. */
function resolveMedia(value: unknown, mediaBaseUrl?: string) {
  if (typeof value !== "string" || !value) return { url: null, unavailable: null };
  if (value.startsWith("(")) return { url: null, unavailable: value };
  if (/^https?:\/\//.test(value)) return { url: value, unavailable: null };
  if (mediaBaseUrl) return { url: `${mediaBaseUrl}/${value.split("/").map(encodeURIComponent).join("/")}`, unavailable: null };
  return { url: null, unavailable: `local:${value}` };
}

function flattenText(text: RawMessage["text"]): string {
  if (typeof text === "string") return text;
  return text.map((part) => (typeof part === "string" ? part : part.text)).join("");
}

const num = (v: unknown) => (v === undefined || v === null ? null : Number(v));
const str = (v: unknown) => (v === undefined || v === null ? null : String(v));
const ts = (unix: unknown) => (unix ? new Date(Number(unix) * 1000) : null);

function peerKind(id: string) {
  return id.match(/^[a-z]+/)?.[0] ?? "unknown";
}

function toRow(chatId: number, m: RawMessage, mediaBaseUrl?: string): typeof messages.$inferInsert {
  const file = resolveMedia(m.file, mediaBaseUrl);
  const photo = resolveMedia(m.photo, mediaBaseUrl);
  const thumb = resolveMedia(m.thumbnail, mediaBaseUrl);
  const loc = m.location_information as { latitude: number; longitude: number } | undefined;

  return {
    chatId,
    id: m.id,
    type: m.type,
    date: ts(m.date_unixtime)!,
    dateUnixtime: Number(m.date_unixtime),
    edited: ts(m.edited_unixtime),
    editedUnixtime: num(m.edited_unixtime),
    fromId: str(m.from_id),
    fromName: str(m.from),
    textPlain: flattenText(m.text),
    textEntities: m.text_entities ?? [],
    replyToMessageId: num(m.reply_to_message_id),
    replyToPeerId: str(m.reply_to_peer_id),
    forwardedFrom: str(m.forwarded_from),
    forwardedFromId: str(m.forwarded_from_id),
    savedFrom: str(m.saved_from),
    viaBot: str(m.via_bot),
    mediaType: str(m.media_type),
    mimeType: str(m.mime_type),
    fileName: str(m.file_name),
    fileSize: num(m.file_size),
    fileUrl: file.url,
    photoUrl: photo.url,
    photoFileSize: num(m.photo_file_size),
    thumbnailUrl: thumb.url,
    thumbnailFileSize: num(m.thumbnail_file_size),
    mediaUnavailableReason: file.unavailable ?? photo.unavailable,
    width: num(m.width),
    height: num(m.height),
    durationSeconds: num(m.duration_seconds),
    stickerEmoji: str(m.sticker_emoji),
    mediaSpoiler: m.media_spoiler === undefined ? null : Boolean(m.media_spoiler),
    selfDestructPeriodSeconds: num(m.self_destruct_period_seconds),
    action: str(m.action),
    actor: str(m.actor),
    actorId: str(m.actor_id),
    discardReason: str(m.discard_reason),
    pinnedMessageId: num(m.message_id),
    emoticon: str(m.emoticon),
    poll: (m.poll as typeof messages.$inferInsert.poll) ?? null,
    latitude: loc?.latitude ?? null,
    longitude: loc?.longitude ?? null,
    liveLocationPeriodSeconds: num(m.live_location_period_seconds),
    placeName: str(m.place_name),
    address: str(m.address),
    contact: (m.contact_information as typeof messages.$inferInsert.contact) ?? null,
    inlineBotButtons: (m.inline_bot_buttons as typeof messages.$inferInsert.inlineBotButtons) ?? null,
    raw: m,
  };
}

// ON CONFLICT DO UPDATE SET col = excluded.col for every non-key column.
const messageColumns = getTableColumns(messages);
const upsertSet = Object.fromEntries(
  Object.entries(messageColumns)
    .filter(([key]) => key !== "chatId" && key !== "id")
    .map(([key, col]) => [key, sql.raw(`excluded."${col.name}"`)]),
);

async function main() {
  const { file, mediaBaseUrl } = parseArgs();
  console.log(`Reading ${file}...`);
  const chat = JSON.parse(await readFile(file, "utf8")) as RawChat;
  if (!Array.isArray(chat.messages)) {
    throw new Error("Expected a single-chat export with a top-level `messages` array");
  }
  console.log(`Chat "${chat.name}" (${chat.id}), ${chat.messages.length} messages`);

  const unknownKeys = new Set<string>();
  const peerMap = new Map<string, string | null>();
  const notePeer = (id: unknown, name: unknown) => {
    if (typeof id !== "string") return;
    // Keep the first non-empty name we see.
    if (!peerMap.get(id)) peerMap.set(id, typeof name === "string" ? name : null);
  };

  for (const m of chat.messages) {
    for (const key of Object.keys(m)) if (!KNOWN_KEYS.has(key)) unknownKeys.add(key);
    notePeer(m.from_id, m.from);
    notePeer(m.forwarded_from_id, m.forwarded_from);
    notePeer(m.actor_id, m.actor);
    notePeer(m.reply_to_peer_id, null);
  }

  await db
    .insert(chats)
    .values({ id: chat.id, name: chat.name ?? null, type: chat.type })
    .onConflictDoUpdate({
      target: chats.id,
      set: { name: chat.name ?? null, type: chat.type, importedAt: new Date() },
    });

  const peerRows = [...peerMap].map(([id, name]) => ({ id, name, kind: peerKind(id) }));
  for (let i = 0; i < peerRows.length; i += BATCH) {
    await db
      .insert(peers)
      .values(peerRows.slice(i, i + BATCH))
      .onConflictDoUpdate({
        target: peers.id,
        set: { name: sql`coalesce(excluded.name, ${peers.name})`, kind: sql`excluded.kind` },
      });
  }

  const started = Date.now();
  let reactionCount = 0;
  for (let i = 0; i < chat.messages.length; i += BATCH) {
    const batch = chat.messages.slice(i, i + BATCH);
    await db.transaction(async (tx) => {
      await tx
        .insert(messages)
        .values(batch.map((m) => toRow(chat.id, m, mediaBaseUrl)))
        .onConflictDoUpdate({ target: [messages.chatId, messages.id], set: upsertSet });

      // Reactions are replaced wholesale for the messages in this batch.
      await tx.delete(reactions).where(
        and(eq(reactions.chatId, chat.id), inArray(reactions.messageId, batch.map((m) => m.id))),
      );
      const reactionRows = batch.flatMap((m) =>
        ((m.reactions as Record<string, unknown>[] | undefined) ?? []).map((r, position) => ({
          chatId: chat.id,
          messageId: m.id,
          position,
          type: String(r.type),
          emoji: str(r.emoji),
          documentId: str(r.document_id),
          count: Number(r.count ?? 0),
          recent: (r.recent as typeof reactions.$inferInsert.recent) ?? [],
        })),
      );
      if (reactionRows.length) await tx.insert(reactions).values(reactionRows);
      reactionCount += reactionRows.length;
    });
    const done = Math.min(i + BATCH, chat.messages.length);
    if (done % 20000 === 0 || done === chat.messages.length) console.log(`  ${done}/${chat.messages.length} messages`);
  }

  console.log(`Done in ${((Date.now() - started) / 1000).toFixed(1)}s: ${peerRows.length} peers, ${reactionCount} reactions`);
  if (unknownKeys.size) {
    console.warn(`Fields without a dedicated column (kept in messages.raw): ${[...unknownKeys].join(", ")}`);
  }
  await db.$client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
