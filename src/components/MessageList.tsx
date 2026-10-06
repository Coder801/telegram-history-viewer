"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import { dayKey, formatDay } from "@/lib/format";
import type { MessageDto, MessagesPage } from "@/lib/types";
import { Message } from "./Message";

const START_INDEX = 10_000_000;
const PAGE = 60;
const GROUP_GAP_MS = 10 * 60 * 1000;

export type MessageListHandle = {
  jumpToMessage: (id: number) => void;
  /** Resolves to false when there are no messages on or after the date. */
  jumpToDate: (date: Date) => Promise<boolean>;
  /** Date of the topmost visible message. */
  getVisibleDate: () => string | null;
  jumpToLatest: () => void;
};

type Loaded = {
  items: MessageDto[];
  firstItemIndex: number;
  hasOlder: boolean;
  hasNewer: boolean;
  /** Changing it remounts Virtuoso so `initialTopMostItemIndex` applies again. */
  version: number;
  initialIndex: { index: number; align: "start" | "center" } | "LAST";
};

async function fetchPage(chatId: number, query: Record<string, string | number>) {
  const params = new URLSearchParams({ chat: String(chatId), limit: String(PAGE) });
  for (const [k, v] of Object.entries(query)) params.set(k, String(v));
  const res = await fetch(`/api/messages?${params}`);
  if (res.status === 401) {
    // Session expired: reloading lets the proxy redirect to /login.
    window.location.reload();
    throw new Error("unauthorized");
  }
  if (!res.ok) throw new Error(`Failed to load messages: ${res.status}`);
  return (await res.json()) as MessagesPage & { anchor: number | null };
}

function sameGroup(a: MessageDto | undefined, b: MessageDto | undefined) {
  if (!a || !b) return false;
  if (a.type === "service" || b.type === "service") return false;
  return (
    a.fromId === b.fromId &&
    dayKey(a.date) === dayKey(b.date) &&
    Math.abs(new Date(a.date).getTime() - new Date(b.date).getTime()) < GROUP_GAP_MS
  );
}

function DatePill({ iso }: { iso: string }) {
  return (
    <span className="rounded-full bg-tg-service px-3 py-1 text-sm font-medium text-white/90 select-none">
      {formatDay(iso)}
    </span>
  );
}

export const MessageList = forwardRef<MessageListHandle, { chatId: number }>(function MessageList({ chatId }, ref) {
  const virtuoso = useRef<VirtuosoHandle>(null);
  const [state, setState] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<number | null>(null);
  const [topDate, setTopDate] = useState<string | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [atTop, setAtTop] = useState(false);
  const [scrolling, setScrolling] = useState(false);
  const scroller = useRef<HTMLElement | null>(null);
  const itemsRef = useRef<MessageDto[]>([]);
  const frame = useRef(0);
  const hideDateTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const loading = useRef({ older: false, newer: false });

  const applyLatest = useCallback((page: MessagesPage) => {
    setState((s) => ({
      items: page.messages,
      firstItemIndex: START_INDEX,
      hasOlder: page.hasOlder,
      hasNewer: false,
      version: (s?.version ?? 0) + 1,
      initialIndex: "LAST",
    }));
  }, []);

  const loadLatest = useCallback(async () => {
    try {
      applyLatest(await fetchPage(chatId, {}));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [chatId, applyLatest]);

  const loadAround = useCallback(
    async (query: { around: number } | { date: string }) => {
      try {
        const page = await fetchPage(chatId, query);
        const byDate = "date" in query;
        const anchor = byDate ? page.anchor : query.around;
        if (anchor === null || !page.messages.length) return false;
        const index = Math.max(page.messages.findIndex((m) => m.id === anchor), 0);
        setState((s) => ({
          items: page.messages,
          firstItemIndex: START_INDEX,
          hasOlder: page.hasOlder,
          hasNewer: page.hasNewer,
          version: (s?.version ?? 0) + 1,
          // A date jump shows the start of that day at the top, like Telegram; a message jump centers it.
          initialIndex: { index, align: byDate ? "start" : "center" },
        }));
        if (!byDate) setHighlightId(anchor);
        return true;
      } catch (e) {
        setError((e as Error).message);
        return false;
      }
    },
    [chatId],
  );

  useEffect(() => {
    let cancelled = false;
    fetchPage(chatId, {})
      .then((page) => !cancelled && applyLatest(page))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [chatId, applyLatest]);

  // Drop the highlight once the flash animation is over.
  useEffect(() => {
    if (highlightId === null) return;
    const t = setTimeout(() => setHighlightId(null), 1800);
    return () => clearTimeout(t);
  }, [highlightId]);

  const jumpToMessage = useCallback(
    (id: number) => {
      const index = state?.items.findIndex((m) => m.id === id) ?? -1;
      if (index >= 0) {
        virtuoso.current?.scrollToIndex({ index, align: "center", behavior: "auto" });
        setHighlightId(id);
        return;
      }
      void loadAround({ around: id });
    },
    [state, loadAround],
  );

  useImperativeHandle(
    ref,
    () => ({
      jumpToMessage,
      jumpToDate: (date) => loadAround({ date: date.toISOString() }),
      getVisibleDate: () => topDate,
      jumpToLatest: () => {
        if (state?.hasNewer) void loadLatest();
        else virtuoso.current?.scrollToIndex({ index: "LAST", behavior: "smooth" });
      },
    }),
    [jumpToMessage, loadAround, loadLatest, state?.hasNewer, topDate],
  );

  const loadOlder = useCallback(async () => {
    if (!state?.hasOlder || loading.current.older || !state.items.length) return;
    loading.current.older = true;
    try {
      const page = await fetchPage(chatId, { before: state.items[0].id });
      setState((s) =>
        s && {
          ...s,
          items: [...page.messages, ...s.items],
          firstItemIndex: s.firstItemIndex - page.messages.length,
          hasOlder: page.hasOlder,
        },
      );
    } finally {
      loading.current.older = false;
    }
  }, [chatId, state]);

  const loadNewer = useCallback(async () => {
    if (!state?.hasNewer || loading.current.newer || !state.items.length) return;
    loading.current.newer = true;
    try {
      const page = await fetchPage(chatId, { after: state.items[state.items.length - 1].id });
      setState((s) => s && { ...s, items: [...s.items, ...page.messages], hasNewer: page.hasNewer });
    } finally {
      loading.current.newer = false;
    }
  }, [chatId, state]);

  useEffect(() => {
    itemsRef.current = state?.items ?? [];
  }, [state?.items]);

  // Virtuoso's rangeChanged includes the off-screen overscan, so the topmost
  // visible message (for the floating date and the calendar) is read from the DOM.
  const updateTopDate = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const edge = el.getBoundingClientRect().top + 1;
    const top = [...el.querySelectorAll<HTMLElement>("[data-mid]")].find((n) => n.getBoundingClientRect().bottom > edge);
    const m = top && itemsRef.current.find((x) => x.id === Number(top.dataset.mid));
    if (m) setTopDate(m.date);
  }, []);

  const onScroll = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(updateTopDate);
  }, [updateTopDate]);

  if (error) {
    return <div className="flex flex-1 items-center justify-center text-tg-muted">Ошибка: {error}</div>;
  }
  if (!state) {
    return <div className="flex flex-1 items-center justify-center text-tg-muted">Загрузка…</div>;
  }

  const { items, firstItemIndex } = state;

  return (
    <div className="relative min-h-0 flex-1">
      {topDate && scrolling && !atTop && (
        <div className="pointer-events-none absolute top-2 left-0 z-10 flex w-full justify-center">
          <DatePill iso={topDate} />
        </div>
      )}
      <Virtuoso
        key={state.version}
        ref={virtuoso}
        className="scrollbar-thin"
        data={items}
        firstItemIndex={firstItemIndex}
        initialTopMostItemIndex={state.initialIndex === "LAST" ? { index: "LAST", align: "end" } : state.initialIndex}
        computeItemKey={(_, m) => m.id}
        startReached={() => void loadOlder()}
        endReached={() => void loadNewer()}
        increaseViewportBy={{ top: 800, bottom: 800 }}
        atBottomStateChange={setAtBottom}
        atTopStateChange={setAtTop}
        scrollerRef={(el) => {
          scroller.current?.removeEventListener("scroll", onScroll);
          scroller.current = el instanceof HTMLElement ? el : null;
          scroller.current?.addEventListener("scroll", onScroll, { passive: true });
        }}
        rangeChanged={updateTopDate}
        // Like Telegram: the floating date shows while scrolling and fades a moment after.
        isScrolling={(value) => {
          clearTimeout(hideDateTimer.current);
          if (value) setScrolling(true);
          else hideDateTimer.current = setTimeout(() => setScrolling(false), 1000);
        }}
        components={{
          Header: () => (
            <div className="py-4 text-center text-sm text-tg-muted">
              {state.hasOlder ? "Загрузка…" : "Начало переписки"}
            </div>
          ),
          Footer: () => <div className={state.hasNewer ? "py-4 text-center text-sm text-tg-muted" : "h-3"}>{state.hasNewer && "Загрузка…"}</div>,
        }}
        itemContent={(absoluteIndex, m) => {
          const i = absoluteIndex - firstItemIndex;
          const prev = items[i - 1];
          const next = items[i + 1];
          const newDay = !prev || dayKey(prev.date) !== dayKey(m.date);
          return (
            <div className="mx-auto w-full max-w-3xl" data-mid={m.id}>
              {newDay && (
                <div className="flex justify-center py-2">
                  <DatePill iso={m.date} />
                </div>
              )}
              <Message
                m={m}
                groupFirst={newDay || !sameGroup(prev, m)}
                groupLast={!sameGroup(m, next)}
                highlighted={highlightId === m.id}
                onJump={jumpToMessage}
              />
            </div>
          );
        }}
      />
      {(!atBottom || state.hasNewer) && (
        <button
          onClick={() => (state.hasNewer ? void loadLatest() : virtuoso.current?.scrollToIndex({ index: "LAST", behavior: "smooth" }))}
          className="absolute right-5 bottom-5 flex size-12 items-center justify-center rounded-full bg-tg-panel text-2xl text-tg-muted shadow-lg transition hover:text-tg-text"
          title="К последним сообщениям"
        >
          ↓
        </button>
      )}
    </div>
  );
});
