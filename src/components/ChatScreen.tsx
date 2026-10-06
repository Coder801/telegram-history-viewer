"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { logout } from "@/app/login/actions";
import { formatShortDate, formatTime, initials, mediaLabel } from "@/lib/format";
import type { ChatDto, SearchHit } from "@/lib/types";
import { Calendar } from "./Calendar";
import { MessageList, type MessageListHandle } from "./MessageList";

function Avatar({ name, size = "size-12" }: { name: string | null; size?: string }) {
  return (
    <div className={`${size} flex shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-[#ff885e] to-[#ff516a] font-medium text-white`}>
      {initials(name)}
    </div>
  );
}

function Sidebar({ chats, activeId }: { chats: ChatDto[]; activeId: number }) {
  return (
    <aside className="hidden w-80 shrink-0 flex-col border-r border-tg-border bg-tg-panel lg:flex">
      <div className="flex h-14 items-center justify-between px-4">
        <span className="text-lg font-medium">Архив чатов</span>
        <form action={logout}>
          <button className="text-sm text-tg-muted hover:text-tg-text" title="Выйти">Выйти</button>
        </form>
      </div>
      <nav className="scrollbar-thin flex-1 overflow-y-auto">
        {chats.map((c) => {
          const last = c.lastMessage;
          const preview = last ? last.text || mediaLabel(last.mediaType, false) || "Сообщение" : "Нет сообщений";
          return (
            <Link
              key={c.id}
              href={`/chat/${c.id}`}
              className={`mx-2 flex items-center gap-3 rounded-xl p-2 ${c.id === activeId ? "bg-tg-active" : "hover:bg-tg-hover"}`}
            >
              <Avatar name={c.name} size="size-[54px]" />
              <div className="min-w-0 flex-1">
                <div className="flex justify-between gap-2">
                  <span className="truncate font-medium">{c.name ?? "Без имени"}</span>
                  {last && <span className="shrink-0 text-xs text-tg-muted">{formatShortDate(last.date)}</span>}
                </div>
                <div className={`truncate text-sm ${c.id === activeId ? "text-white/70" : "text-tg-muted"}`}>{preview}</div>
              </div>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

function highlight(text: string, query: string) {
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return text.slice(0, 140);
  const start = Math.max(0, idx - 40);
  return (
    <>
      {start > 0 && "…"}
      {text.slice(start, idx)}
      <mark className="rounded-sm bg-tg-accent/60 text-white">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length, idx + query.length + 100)}
    </>
  );
}

function SearchPanel({ chat, onPick, onClose }: { chat: ChatDto; onPick: (id: number) => void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => input.current?.focus(), []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const controller = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?chat=${chat.id}&q=${encodeURIComponent(q)}`, { signal: controller.signal });
        const data = (await res.json()) as { hits: SearchHit[] };
        setHits(data.hits);
        setExhausted(data.hits.length < 50);
      } catch {
        // aborted
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [query, chat.id]);

  const visibleHits = query.trim().length < 2 ? [] : hits;

  async function loadMore() {
    setLoading(true);
    const res = await fetch(`/api/search?chat=${chat.id}&q=${encodeURIComponent(query.trim())}&offset=${hits.length}`);
    const data = (await res.json()) as { hits: SearchHit[] };
    setHits((h) => [...h, ...data.hits]);
    setExhausted(data.hits.length < 50);
    setLoading(false);
  }

  return (
    <aside className="absolute inset-0 z-20 flex flex-col bg-tg-panel md:static md:w-96 md:shrink-0 md:border-l md:border-tg-border">
      <div className="flex h-14 items-center gap-2 px-3">
        <button onClick={onClose} className="px-2 text-xl text-tg-muted hover:text-tg-text" title="Закрыть">✕</button>
        <input
          ref={input}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по переписке"
          className="flex-1 rounded-full bg-tg-bg px-4 py-2 text-sm outline-none placeholder:text-tg-muted focus:ring-1 focus:ring-tg-accent"
        />
      </div>
      <div className="px-4 pb-2 text-xs text-tg-muted">
        {query.trim().length < 2 ? "Введите минимум 2 символа" : loading && !hits.length ? "Поиск…" : `Найдено: ${hits.length}${exhausted ? "" : "+"}`}
      </div>
      <div className="scrollbar-thin flex-1 overflow-y-auto">
        {visibleHits.map((h) => (
          <button
            key={h.id}
            onClick={() => onPick(h.id)}
            className="flex w-full gap-3 px-3 py-2 text-left hover:bg-tg-hover"
          >
            <Avatar name={h.out ? "Я" : chat.name} size="size-10" />
            <div className="min-w-0 flex-1">
              <div className="flex justify-between gap-2 text-sm">
                <span className="truncate font-medium">{h.out ? "Вы" : h.fromName}</span>
                <span className="shrink-0 text-xs text-tg-muted">{formatShortDate(h.date)} {formatTime(h.date)}</span>
              </div>
              <div className="line-clamp-2 text-sm break-words text-tg-muted">{highlight(h.text, query.trim())}</div>
            </div>
          </button>
        ))}
        {!exhausted && visibleHits.length > 0 && (
          <button onClick={loadMore} disabled={loading} className="w-full py-3 text-sm text-tg-link hover:bg-tg-hover">
            {loading ? "Загрузка…" : "Показать ещё"}
          </button>
        )}
      </div>
    </aside>
  );
}

export function ChatScreen({ chats, chat }: { chats: ChatDto[]; chat: ChatDto }) {
  const list = useRef<MessageListHandle>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  // Holds the date visible in the chat when the calendar was opened; null = closed.
  const [calendar, setCalendar] = useState<{ date: string | null } | null>(null);

  return (
    <div className="flex h-dvh">
      <Sidebar chats={chats} activeId={chat.id} />

      <main className="chat-wallpaper relative flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-tg-border bg-tg-panel px-4">
          <Avatar name={chat.name} size="size-10" />
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">{chat.name}</div>
            <div className="truncate text-sm text-tg-muted">{chat.messageCount.toLocaleString("ru-RU")} сообщений</div>
          </div>
          <button
            onClick={() => setCalendar({ date: list.current?.getVisibleDate() ?? null })}
            className="rounded-full p-2 text-xl text-tg-muted hover:bg-tg-hover hover:text-tg-text"
            title="Перейти к дате"
          >
            📅
          </button>
          <button
            onClick={() => setSearchOpen((v) => !v)}
            className={`rounded-full p-2 text-xl hover:bg-tg-hover ${searchOpen ? "text-tg-link" : "text-tg-muted hover:text-tg-text"}`}
            title="Поиск"
          >
            🔍
          </button>
          <form action={logout} className="lg:hidden">
            <button className="rounded-full p-2 text-sm text-tg-muted hover:bg-tg-hover hover:text-tg-text">Выйти</button>
          </form>
        </header>

        <MessageList ref={list} chatId={chat.id} />
      </main>

      {calendar && (
        <Calendar
          chatId={chat.id}
          initialDate={calendar.date}
          onPick={(date) => list.current?.jumpToDate(date) ?? Promise.resolve(false)}
          onClose={() => setCalendar(null)}
        />
      )}

      {searchOpen && (
        <SearchPanel
          chat={chat}
          onClose={() => setSearchOpen(false)}
          onPick={(id) => {
            list.current?.jumpToMessage(id);
            if (window.innerWidth < 768) setSearchOpen(false);
          }}
        />
      )}
    </div>
  );
}
