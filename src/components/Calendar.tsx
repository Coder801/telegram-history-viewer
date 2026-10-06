"use client";

import { useEffect, useRef, useState } from "react";

const MONTHS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
const MONTHS_SHORT = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

type Overview = { months: Record<string, number>; first: string | null; last: string | null };
type YearMonth = { year: number; month: number }; // month: 0-11

const monthKey = ({ year, month }: YearMonth) => `${year}-${String(month + 1).padStart(2, "0")}`;
const toYM = (d: Date): YearMonth => ({ year: d.getFullYear(), month: d.getMonth() });
const cmp = (a: YearMonth, b: YearMonth) => a.year * 12 + a.month - (b.year * 12 + b.month);
const addMonths = (ym: YearMonth, n: number): YearMonth => {
  const total = ym.year * 12 + ym.month + n;
  return { year: Math.floor(total / 12), month: total % 12 };
};

const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

// Cache across openings: the history is static.
const overviewCache = new Map<number, Promise<Overview>>();
const daysCache = new Map<string, Promise<Record<string, number>>>();

function loadOverview(chatId: number) {
  let p = overviewCache.get(chatId);
  if (!p) {
    p = fetch(`/api/calendar?chat=${chatId}&tz=${encodeURIComponent(timeZone())}`).then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.json() as Promise<Overview>;
    });
    p.catch(() => overviewCache.delete(chatId));
    overviewCache.set(chatId, p);
  }
  return p;
}

function loadDays(chatId: number, ym: YearMonth) {
  const key = `${chatId}:${monthKey(ym)}`;
  let p = daysCache.get(key);
  if (!p) {
    p = fetch(`/api/calendar?chat=${chatId}&tz=${encodeURIComponent(timeZone())}&month=${monthKey(ym)}`)
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json() as Promise<{ days: Record<string, number> }>;
      })
      .then((d) => d.days);
    p.catch(() => daysCache.delete(key));
    daysCache.set(key, p);
  }
  return p;
}

type Props = {
  chatId: number;
  /** Day to open the calendar on and mark as current (the date visible in the chat). */
  initialDate: string | null;
  onPick: (date: Date) => Promise<boolean>;
  onClose: () => void;
};

export function Calendar({ chatId, initialDate, onPick, onClose }: Props) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [view, setView] = useState<YearMonth | null>(null);
  const [mode, setMode] = useState<"days" | "months">("days");
  const [days, setDays] = useState<{ key: string; counts: Record<string, number> } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialog = useRef<HTMLDivElement>(null);

  const current = initialDate ? new Date(initialDate) : null;
  const first = overview?.first ? toYM(new Date(overview.first)) : null;
  const last = overview?.last ? toYM(new Date(overview.last)) : null;

  useEffect(() => {
    let cancelled = false;
    loadOverview(chatId)
      .then((o) => {
        if (cancelled) return;
        setOverview(o);
        const start = initialDate ? toYM(new Date(initialDate)) : o.last ? toYM(new Date(o.last)) : toYM(new Date());
        setView(start);
      })
      .catch(() => !cancelled && setError("Не удалось загрузить календарь"));
    return () => {
      cancelled = true;
    };
  }, [chatId, initialDate]);

  useEffect(() => {
    if (!view || mode !== "days") return;
    let cancelled = false;
    const key = monthKey(view);
    loadDays(chatId, view)
      .then((counts) => !cancelled && setDays({ key, counts }))
      .catch(() => !cancelled && setError("Не удалось загрузить месяц"));
    return () => {
      cancelled = true;
    };
  }, [chatId, view, mode]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    dialog.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function pick(date: Date) {
    setBusy(true);
    const ok = await onPick(date);
    setBusy(false);
    if (ok) onClose();
    else setError("В этот день сообщений нет");
  }

  const canPrev = !!view && !!first && (mode === "days" ? cmp(view, first) > 0 : view.year > first.year);
  const canNext = !!view && !!last && (mode === "days" ? cmp(view, last) < 0 : view.year < last.year);
  const step = (dir: 1 | -1) => {
    setError(null);
    setView((v) => v && (mode === "days" ? addMonths(v, dir) : { ...v, year: v.year + dir }));
  };

  const dayCounts = view && days?.key === monthKey(view) ? days.counts : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onMouseDown={onClose}>
      <div
        ref={dialog}
        tabIndex={-1}
        role="dialog"
        aria-label="Перейти к дате"
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-[340px] rounded-2xl bg-tg-panel p-4 shadow-2xl outline-none"
      >
        <div className="mb-3 flex items-center justify-between">
          <button
            onClick={() => step(-1)}
            disabled={!canPrev}
            className="flex size-9 items-center justify-center rounded-full text-xl text-tg-muted enabled:hover:bg-tg-hover enabled:hover:text-tg-text disabled:opacity-25"
            aria-label="Назад"
          >
            ‹
          </button>
          <button
            onClick={() => {
              setError(null);
              setMode((m) => (m === "days" ? "months" : "days"));
            }}
            disabled={!view}
            className="rounded-lg px-3 py-1 font-medium hover:bg-tg-hover"
            title={mode === "days" ? "Выбрать месяц" : "Назад к дням"}
          >
            {view ? (mode === "days" ? `${MONTHS[view.month]} ${view.year}` : view.year) : "…"}
          </button>
          <button
            onClick={() => step(1)}
            disabled={!canNext}
            className="flex size-9 items-center justify-center rounded-full text-xl text-tg-muted enabled:hover:bg-tg-hover enabled:hover:text-tg-text disabled:opacity-25"
            aria-label="Вперёд"
          >
            ›
          </button>
        </div>

        {!view || !overview ? (
          <div className="flex h-64 items-center justify-center text-sm text-tg-muted">{error ?? "Загрузка…"}</div>
        ) : mode === "months" ? (
          <div className="grid h-64 grid-cols-3 content-center gap-2">
            {MONTHS_SHORT.map((label, month) => {
              const count = overview.months[monthKey({ year: view.year, month })] ?? 0;
              const active = current && current.getFullYear() === view.year && current.getMonth() === month;
              return (
                <button
                  key={month}
                  disabled={!count}
                  onClick={() => {
                    setView({ year: view.year, month });
                    setMode("days");
                  }}
                  title={count ? `${count.toLocaleString("ru-RU")} сообщений` : "Нет сообщений"}
                  className={`rounded-xl py-3 text-sm capitalize transition disabled:opacity-25 ${
                    active ? "bg-tg-accent text-white" : "enabled:hover:bg-tg-hover"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="h-64">
            <div className="mb-1 grid grid-cols-7 text-center text-xs text-tg-muted">
              {WEEKDAYS.map((d) => (
                <div key={d} className="py-1">{d}</div>
              ))}
            </div>
            <DayGrid
              view={view}
              counts={dayCounts}
              current={current}
              disabled={busy}
              onPick={(day) => void pick(new Date(view.year, view.month, day))}
            />
          </div>
        )}

        <div className="mt-3 flex items-center justify-between gap-2 text-sm">
          <span className="truncate text-red-400">{error}</span>
          <div className="flex shrink-0 gap-1">
            {overview?.first && (
              <button
                onClick={() => void pick(new Date(overview.first!))}
                disabled={busy}
                className="rounded-lg px-3 py-2 font-medium text-tg-link hover:bg-tg-hover"
              >
                К началу
              </button>
            )}
            <button onClick={onClose} className="rounded-lg px-3 py-2 font-medium text-tg-link hover:bg-tg-hover">
              Отмена
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DayGrid({ view, counts, current, disabled, onPick }: {
  view: YearMonth;
  counts: Record<string, number> | null;
  current: Date | null;
  disabled: boolean;
  onPick: (day: number) => void;
}) {
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
  const offset = (new Date(view.year, view.month, 1).getDay() + 6) % 7; // Monday first
  const isCurrentMonth = current && current.getFullYear() === view.year && current.getMonth() === view.month;

  return (
    <div className="grid grid-cols-7 gap-y-1 text-center">
      {Array.from({ length: offset }, (_, i) => <div key={`pad-${i}`} />)}
      {Array.from({ length: daysInMonth }, (_, i) => {
        const day = i + 1;
        const count = counts?.[day] ?? 0;
        const active = isCurrentMonth && current.getDate() === day;
        return (
          <button
            key={day}
            disabled={disabled || !counts || !count}
            onClick={() => onPick(day)}
            title={count ? `${count.toLocaleString("ru-RU")} сообщений` : "Нет сообщений"}
            className={`mx-auto flex size-9 items-center justify-center rounded-full text-sm transition disabled:cursor-default ${
              !counts ? "opacity-40" : !count ? "opacity-25" : ""
            } ${active ? "bg-tg-accent font-medium text-white" : "enabled:hover:bg-tg-hover"}`}
          >
            {day}
          </button>
        );
      })}
    </div>
  );
}
