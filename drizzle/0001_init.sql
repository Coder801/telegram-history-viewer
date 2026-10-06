CREATE TABLE "chats" (
	"id" bigint PRIMARY KEY NOT NULL,
	"name" text,
	"type" text NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"chat_id" bigint NOT NULL,
	"id" bigint NOT NULL,
	"type" text NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"date_unixtime" bigint NOT NULL,
	"edited" timestamp with time zone,
	"edited_unixtime" bigint,
	"from_id" text,
	"from_name" text,
	"text_plain" text DEFAULT '' NOT NULL,
	"text_entities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reply_to_message_id" bigint,
	"reply_to_peer_id" text,
	"forwarded_from" text,
	"forwarded_from_id" text,
	"saved_from" text,
	"via_bot" text,
	"media_type" text,
	"mime_type" text,
	"file_name" text,
	"file_size" bigint,
	"file_url" text,
	"photo_url" text,
	"photo_file_size" bigint,
	"thumbnail_url" text,
	"thumbnail_file_size" bigint,
	"media_unavailable_reason" text,
	"width" integer,
	"height" integer,
	"duration_seconds" integer,
	"sticker_emoji" text,
	"media_spoiler" boolean,
	"self_destruct_period_seconds" integer,
	"action" text,
	"actor" text,
	"actor_id" text,
	"discard_reason" text,
	"pinned_message_id" bigint,
	"emoticon" text,
	"poll" jsonb,
	"latitude" double precision,
	"longitude" double precision,
	"live_location_period_seconds" integer,
	"place_name" text,
	"address" text,
	"contact" jsonb,
	"inline_bot_buttons" jsonb,
	"raw" jsonb NOT NULL,
	CONSTRAINT "messages_chat_id_id_pk" PRIMARY KEY("chat_id","id")
);
--> statement-breakpoint
CREATE TABLE "peers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"kind" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reactions" (
	"chat_id" bigint NOT NULL,
	"message_id" bigint NOT NULL,
	"position" integer NOT NULL,
	"type" text NOT NULL,
	"emoji" text,
	"document_id" text,
	"count" integer NOT NULL,
	"recent" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "reactions_chat_id_message_id_position_pk" PRIMARY KEY("chat_id","message_id","position")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_chat_id_message_id_messages_chat_id_id_fk" FOREIGN KEY ("chat_id","message_id") REFERENCES "public"."messages"("chat_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "messages_chat_date_idx" ON "messages" USING btree ("chat_id","date","id");--> statement-breakpoint
CREATE INDEX "messages_reply_idx" ON "messages" USING btree ("chat_id","reply_to_message_id");--> statement-breakpoint
CREATE INDEX "messages_text_trgm_idx" ON "messages" USING gin ("text_plain" gin_trgm_ops);