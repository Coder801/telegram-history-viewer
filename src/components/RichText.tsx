"use client";

import { useState, type ReactNode } from "react";
import type { TextEntity } from "@/db/schema";

function Spoiler({ children }: { children: ReactNode }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <span className={revealed ? undefined : "spoiler"} onClick={() => setRevealed(true)}>
      {children}
    </span>
  );
}

const linkClass = "text-tg-link hover:underline break-all";

function safeHref(url: string) {
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`;
  return /^(https?|tg|mailto|tel):/i.test(withScheme) ? withScheme : undefined;
}

function renderEntity(e: TextEntity, key: number): ReactNode {
  switch (e.type) {
    case "bold":
      return <strong key={key}>{e.text}</strong>;
    case "italic":
      return <em key={key}>{e.text}</em>;
    case "underline":
      return <u key={key}>{e.text}</u>;
    case "strikethrough":
      return <s key={key}>{e.text}</s>;
    case "code":
      return <code key={key} className="rounded bg-black/25 px-1 font-mono text-[0.92em] text-[#e6a07a]">{e.text}</code>;
    case "pre":
      return (
        <pre key={key} className="my-1 overflow-x-auto rounded-md bg-black/25 p-2 font-mono text-[0.9em]">
          {e.text}
        </pre>
      );
    case "spoiler":
      return <Spoiler key={key}>{e.text}</Spoiler>;
    case "blockquote":
      return (
        <blockquote key={key} className="my-1 rounded-r-md border-l-[3px] border-tg-link bg-tg-link/10 py-0.5 pr-2 pl-2">
          {e.text}
        </blockquote>
      );
    case "link": {
      const href = safeHref(e.text);
      return href ? <a key={key} href={href} target="_blank" rel="noreferrer noopener" className={linkClass}>{e.text}</a> : e.text;
    }
    case "text_link": {
      const href = e.href ? safeHref(e.href) : undefined;
      return href ? <a key={key} href={href} target="_blank" rel="noreferrer noopener" className={linkClass} title={e.href}>{e.text}</a> : e.text;
    }
    case "email":
      return <a key={key} href={`mailto:${e.text}`} className={linkClass}>{e.text}</a>;
    case "phone":
      return <a key={key} href={`tel:${e.text.replace(/[^\d+]/g, "")}`} className={linkClass}>{e.text}</a>;
    case "mention":
      return (
        <a key={key} href={`https://t.me/${e.text.replace(/^@/, "")}`} target="_blank" rel="noreferrer noopener" className={linkClass}>
          {e.text}
        </a>
      );
    case "mention_name":
    case "hashtag":
    case "cashtag":
    case "bot_command":
    case "bank_card":
      return <span key={key} className="text-tg-link">{e.text}</span>;
    default:
      // plain, custom_emoji (text is the fallback emoji) and anything new
      return e.text;
  }
}

export function RichText({ entities, fallback }: { entities: TextEntity[]; fallback: string }) {
  if (!entities.length) return fallback ? <>{fallback}</> : null;
  return <>{entities.map(renderEntity)}</>;
}

/** Absolute image URLs mentioned in the message, for inline previews. */
export function imageLinks(entities: TextEntity[], isImage: (url: string) => boolean) {
  const urls = entities
    .map((e) => (e.type === "link" ? e.text : e.type === "text_link" ? e.href : undefined))
    .filter((u): u is string => !!u && /^https?:\/\//i.test(u) && isImage(u));
  return [...new Set(urls)].slice(0, 4);
}
