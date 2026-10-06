import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  foreignKey,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/** One rich-text piece as exported by Telegram Desktop (`text_entities[]`). */
export type TextEntity = {
  type: string;
  text: string;
  href?: string;
  user_id?: number;
  document_id?: string;
  language?: string;
  collapsed?: boolean;
};

export type Poll = {
  question: string;
  closed: boolean;
  total_voters: number;
  answers: { text: string; voters: number; chosen: boolean }[];
};

export type Contact = {
  first_name?: string;
  last_name?: string;
  phone_number?: string;
  contact_vcard?: string;
};

export type InlineButton = { type: string; text: string; data?: string };

export type ReactionRecent = { from: string | null; from_id: string; date: string };

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const chats = pgTable("chats", {
  id: bigint("id", { mode: "number" }).primaryKey(),
  name: text("name"),
  type: text("type").notNull(),
  importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Everyone who appears in the chat: participants, forward sources, actors. */
export const peers = pgTable("peers", {
  id: text("id").primaryKey(), // "user380143585", "channel1061098805"
  name: text("name"),
  kind: text("kind").notNull(), // user | channel | chat
});

export const messages = pgTable(
  "messages",
  {
    chatId: bigint("chat_id", { mode: "number" })
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    id: bigint("id", { mode: "number" }).notNull(),
    type: text("type").notNull(), // message | service

    date: timestamp("date", { withTimezone: true }).notNull(),
    dateUnixtime: bigint("date_unixtime", { mode: "number" }).notNull(),
    edited: timestamp("edited", { withTimezone: true }),
    editedUnixtime: bigint("edited_unixtime", { mode: "number" }),

    fromId: text("from_id"),
    fromName: text("from_name"),

    /** Flattened text: used for search and reply previews. */
    textPlain: text("text_plain").notNull().default(""),
    textEntities: jsonb("text_entities").$type<TextEntity[]>().notNull().default([]),

    replyToMessageId: bigint("reply_to_message_id", { mode: "number" }),
    replyToPeerId: text("reply_to_peer_id"),
    forwardedFrom: text("forwarded_from"),
    forwardedFromId: text("forwarded_from_id"),
    savedFrom: text("saved_from"),
    viaBot: text("via_bot"),

    // Media. *_url fields hold absolute URLs; null until media is uploaded somewhere.
    mediaType: text("media_type"),
    mimeType: text("mime_type"),
    fileName: text("file_name"),
    fileSize: bigint("file_size", { mode: "number" }),
    fileUrl: text("file_url"),
    photoUrl: text("photo_url"),
    photoFileSize: bigint("photo_file_size", { mode: "number" }),
    thumbnailUrl: text("thumbnail_url"),
    thumbnailFileSize: bigint("thumbnail_file_size", { mode: "number" }),
    /** Original export value for file/photo when it is not a real path, e.g. "(File not included...)". */
    mediaUnavailableReason: text("media_unavailable_reason"),
    width: integer("width"),
    height: integer("height"),
    durationSeconds: integer("duration_seconds"),
    stickerEmoji: text("sticker_emoji"),
    mediaSpoiler: boolean("media_spoiler"),
    selfDestructPeriodSeconds: integer("self_destruct_period_seconds"),

    // Service messages
    action: text("action"),
    actor: text("actor"),
    actorId: text("actor_id"),
    discardReason: text("discard_reason"),
    pinnedMessageId: bigint("pinned_message_id", { mode: "number" }),
    emoticon: text("emoticon"),

    poll: jsonb("poll").$type<Poll>(),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    liveLocationPeriodSeconds: integer("live_location_period_seconds"),
    placeName: text("place_name"),
    address: text("address"),
    contact: jsonb("contact").$type<Contact>(),
    inlineBotButtons: jsonb("inline_bot_buttons").$type<InlineButton[][]>(),

    /** Original exported object, so nothing from the backup is ever lost. */
    raw: jsonb("raw").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.chatId, t.id] }),
    index("messages_chat_date_idx").on(t.chatId, t.date, t.id),
    index("messages_reply_idx").on(t.chatId, t.replyToMessageId),
    index("messages_text_trgm_idx").using("gin", sql`${t.textPlain} gin_trgm_ops`),
  ],
);

export const reactions = pgTable(
  "reactions",
  {
    chatId: bigint("chat_id", { mode: "number" }).notNull(),
    messageId: bigint("message_id", { mode: "number" }).notNull(),
    position: integer("position").notNull(),
    type: text("type").notNull(), // emoji | custom_emoji | paid
    emoji: text("emoji"),
    documentId: text("document_id"),
    count: integer("count").notNull(),
    recent: jsonb("recent").$type<ReactionRecent[]>().notNull().default([]),
  },
  (t) => [
    primaryKey({ columns: [t.chatId, t.messageId, t.position] }),
    foreignKey({
      columns: [t.chatId, t.messageId],
      foreignColumns: [messages.chatId, messages.id],
    }).onDelete("cascade"),
  ],
);

export type Message = typeof messages.$inferSelect;
export type Reaction = typeof reactions.$inferSelect;
