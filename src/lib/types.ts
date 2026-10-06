import type { Message } from "@/db/schema";

export type ReplyPreview = {
  id: number;
  fromName: string | null;
  text: string;
  mediaType: string | null;
  hasPhoto: boolean;
  stickerEmoji: string | null;
};

export type ReactionDto = { type: string; emoji: string | null; count: number };

/** Message as sent to the client: everything except the heavy `raw` column. */
export type MessageDto = Omit<Message, "raw" | "date" | "edited" | "chatId"> & {
  date: string;
  edited: string | null;
  out: boolean;
  reply: ReplyPreview | null;
  reactions: ReactionDto[];
};

export type ChatDto = {
  id: number;
  name: string | null;
  type: string;
  peerId: string;
  messageCount: number;
  lastMessage: { text: string; date: string; mediaType: string | null } | null;
};

export type MessagesPage = {
  messages: MessageDto[];
  hasOlder: boolean;
  hasNewer: boolean;
};

export type SearchHit = {
  id: number;
  date: string;
  fromName: string | null;
  out: boolean;
  text: string;
};
