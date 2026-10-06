"use client";

import { memo, useState } from "react";
import { formatDuration, formatFull, formatTime, isImageUrl, mediaLabel, proxiedImage } from "@/lib/format";
import type { MessageDto } from "@/lib/types";
import { isBubbleless, isFullBleed, MessageMedia } from "./Media";
import { imageLinks, RichText } from "./RichText";

type Props = {
  m: MessageDto;
  groupFirst: boolean;
  groupLast: boolean;
  highlighted: boolean;
  onJump: (id: number) => void;
};

const CALL_LABELS: Record<string, [string, string]> = {
  missed: ["Пропущенный звонок", "Отменённый звонок"],
  busy: ["Отклонённый звонок", "Отклонённый звонок"],
  hangup: ["Входящий звонок", "Исходящий звонок"],
  disconnect: ["Входящий звонок", "Исходящий звонок"],
};

function serviceText(m: MessageDto) {
  const who = m.actor ?? "Кто-то";
  switch (m.action) {
    case "pin_message":
      return `${who} закрепил(а) сообщение`;
    case "edit_chat_theme":
      return m.emoticon ? `${who} изменил(а) тему чата на ${m.emoticon}` : `${who} отключил(а) тему чата`;
    case "set_chat_wallpaper":
      return `${who} установил(а) новые обои`;
    default:
      return `${who}: ${m.action?.replaceAll("_", " ") ?? "служебное сообщение"}`;
  }
}

function ExternalImage({ url }: { url: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <a href={url} target="_blank" rel="noreferrer noopener" className="mt-1 block overflow-hidden rounded-lg">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={proxiedImage(url)}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className="max-h-80 w-full bg-black/20 object-contain"
      />
    </a>
  );
}

function Meta({ m, overlay }: { m: MessageDto; overlay?: boolean }) {
  return (
    <span
      title={formatFull(m.date) + (m.edited ? `\nИзменено: ${formatFull(m.edited)}` : "")}
      className={`float-right mt-1.5 ml-2 flex items-center gap-1 text-[12px] leading-none whitespace-nowrap select-none ${
        overlay
          ? "absolute right-2 bottom-2 m-0 rounded-full bg-black/45 px-1.5 py-1 text-white"
          : m.out ? "text-tg-out-muted translate-y-1" : "text-tg-muted translate-y-1"
      }`}
    >
      {m.edited && <span>изменено</span>}
      {formatTime(m.date)}
      {m.out && <span className="text-[13px]">✓✓</span>}
    </span>
  );
}

function Reply({ m, onJump }: { m: MessageDto; onJump: (id: number) => void }) {
  const r = m.reply;
  if (!r) {
    if (!m.replyToMessageId) return null;
    return (
      <div className="mb-1 rounded-r-md border-l-[3px] border-tg-link bg-tg-link/10 px-2 py-0.5 text-sm text-tg-muted">
        {m.replyToPeerId ? "Ответ на сообщение из другого чата" : "Сообщение удалено"}
      </div>
    );
  }
  const preview = r.text || (r.stickerEmoji ? `${r.stickerEmoji} Стикер` : mediaLabel(r.mediaType, r.hasPhoto)) || "Сообщение";
  return (
    <button
      onClick={() => onJump(r.id)}
      className="mb-1 block w-full min-w-0 rounded-r-md border-l-[3px] border-tg-link bg-tg-link/10 px-2 py-0.5 text-left text-sm transition hover:bg-tg-link/20"
    >
      <div className="truncate font-medium text-tg-link">{r.fromName ?? "Неизвестно"}</div>
      <div className="truncate opacity-80">{preview}</div>
    </button>
  );
}

function Extras({ m }: { m: MessageDto }) {
  return (
    <>
      {m.poll && (
        <div className="min-w-60 py-1">
          <div className="font-medium">{m.poll.question}</div>
          <div className="mb-2 text-xs text-tg-muted">
            {m.poll.closed ? "Опрос завершён" : "Анонимный опрос"} · {m.poll.total_voters} голосов
          </div>
          {m.poll.answers.map((a, i) => {
            const pct = m.poll!.total_voters ? Math.round((a.voters / m.poll!.total_voters) * 100) : 0;
            return (
              <div key={i} className="mb-2">
                <div className="flex justify-between gap-3 text-sm">
                  <span>{a.chosen && "✓ "}{a.text}</span>
                  <span className="font-medium">{pct}%</span>
                </div>
                <div className="mt-1 h-1 rounded-full bg-tg-link" style={{ width: `${Math.max(pct, 2)}%` }} />
              </div>
            );
          })}
        </div>
      )}
      {m.latitude !== null && m.longitude !== null && (
        <a
          href={`https://www.openstreetmap.org/?mlat=${m.latitude}&mlon=${m.longitude}#map=16/${m.latitude}/${m.longitude}`}
          target="_blank"
          rel="noreferrer noopener"
          className="-mx-1 flex w-64 flex-col items-center justify-center gap-1 rounded-lg bg-gradient-to-br from-[#1f3449] to-[#13202d] py-6 text-center"
        >
          <span className="text-4xl">📍</span>
          <span className="text-sm font-medium text-tg-link">{m.placeName ?? (m.liveLocationPeriodSeconds ? "Трансляция геопозиции" : "Геопозиция")}</span>
          <span className="px-2 text-xs text-tg-muted">{m.address ?? `${m.latitude.toFixed(5)}, ${m.longitude.toFixed(5)}`}</span>
        </a>
      )}
      {m.contact && (
        <div className="flex items-center gap-3 py-1">
          <div className="flex size-11 items-center justify-center rounded-full bg-tg-accent text-lg">👤</div>
          <div>
            <div className="font-medium">{[m.contact.first_name, m.contact.last_name].filter(Boolean).join(" ")}</div>
            <div className="text-sm text-tg-muted">{m.contact.phone_number}</div>
          </div>
        </div>
      )}
    </>
  );
}

function MessageImpl({ m, groupFirst, groupLast, highlighted, onJump }: Props) {
  const flash = highlighted ? "message-flash" : "";

  if (m.type === "service" && m.action !== "phone_call") {
    const pinned = m.action === "pin_message" && m.pinnedMessageId;
    return (
      <div className={`flex justify-center px-4 py-1 ${flash}`}>
        <button
          disabled={!pinned}
          onClick={() => pinned && onJump(m.pinnedMessageId!)}
          className="rounded-full bg-tg-service px-3 py-1 text-sm font-medium text-white/90 enabled:hover:bg-black/50"
        >
          {serviceText(m)}
        </button>
      </div>
    );
  }

  const align = m.out ? "justify-end" : "justify-start";
  const spacing = groupLast ? "pb-2" : "pb-0.5";

  if (m.action === "phone_call") {
    const [incoming, outgoing] = CALL_LABELS[m.discardReason ?? "hangup"] ?? CALL_LABELS.hangup;
    const failed = m.discardReason === "missed" || m.discardReason === "busy";
    return (
      <div className={`flex ${align} px-3 md:px-6 ${spacing} ${flash}`}>
        <div className={`flex items-center gap-3 rounded-2xl px-3 py-2 ${m.out ? "bg-tg-out" : "bg-tg-in"}`}>
          <div className="text-2xl">📞</div>
          <div>
            <div className="font-medium">{m.out ? outgoing : incoming}</div>
            <div className={`text-sm ${failed ? "text-red-400" : "text-tg-muted"}`}>
              {m.out ? "↗" : "↙"} {formatTime(m.date)}
              {m.durationSeconds ? `, ${formatDuration(m.durationSeconds)}` : ""}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const media = <MessageMedia m={m} />;
  const hasMediaContent = m.photoFileSize !== null || !!m.photoUrl || !!m.mediaType || !!m.fileName || m.fileSize !== null;
  const images = imageLinks(m.textEntities, isImageUrl);
  const hasText = !!m.textPlain;

  if (isBubbleless(m)) {
    return (
      <div className={`flex ${align} px-3 md:px-6 ${spacing} ${flash}`}>
        <div className="relative">
          {media}
          <Meta m={m} overlay />
          <Reactions m={m} />
        </div>
      </div>
    );
  }

  const fullBleed = isFullBleed(m);
  const radius = m.out
    ? `rounded-2xl ${groupFirst ? "" : "rounded-tr-md"} ${groupLast ? "rounded-br-sm" : "rounded-br-md"}`
    : `rounded-2xl ${groupFirst ? "" : "rounded-tl-md"} ${groupLast ? "rounded-bl-sm" : "rounded-bl-md"}`;
  const hasHeader = !!m.forwardedFrom || !!m.viaBot || !!m.reply || !!m.replyToMessageId;

  return (
    <div className={`flex ${align} px-3 md:px-6 ${spacing} ${flash}`}>
      <div
        className={`relative max-w-[min(85%,480px)] overflow-hidden ${radius} ${m.out ? "bg-tg-out" : "bg-tg-in"} shadow-sm`}
      >
        {hasHeader && (
          <div className="px-2.5 pt-1.5">
            {m.forwardedFrom && (
              <div className="mb-1 text-sm leading-tight text-tg-link">
                <div className="text-xs opacity-80">Переслано от</div>
                <div className="font-medium">{m.forwardedFrom}</div>
              </div>
            )}
            {m.viaBot && <div className="mb-1 text-sm text-tg-link">через {m.viaBot}</div>}
            <Reply m={m} onJump={onJump} />
          </div>
        )}

        {hasMediaContent && (
          <div className={fullBleed ? `relative ${hasHeader ? "mt-1" : ""}` : "px-2.5 pt-1.5"}>
            {media}
            {fullBleed && !hasText && <Meta m={m} overlay />}
          </div>
        )}

        <div className={`px-2.5 ${hasText || !fullBleed ? "pt-1.5 pb-1.5" : ""}`}>
          {hasText && (
            <div className="text-[15px] leading-[1.35] break-words whitespace-pre-wrap">
              <RichText entities={m.textEntities} fallback={m.textPlain} />
            </div>
          )}
          <Extras m={m} />
          {images.map((url) => <ExternalImage key={url} url={url} />)}
          <Reactions m={m} />
          {m.inlineBotButtons && <Buttons m={m} />}
          {(hasText || !fullBleed) && <Meta m={m} />}
          <div className="clear-both" />
        </div>
      </div>
    </div>
  );
}

function Reactions({ m }: { m: MessageDto }) {
  if (!m.reactions.length) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {m.reactions.map((r, i) => (
        <span
          key={i}
          className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-sm ${m.out ? "bg-white/15" : "bg-tg-accent/25"}`}
        >
          <span>{r.emoji ?? "⭐"}</span>
          {r.count > 1 && <span className="text-xs">{r.count}</span>}
        </span>
      ))}
    </div>
  );
}

function Buttons({ m }: { m: MessageDto }) {
  return (
    <div className="mt-1 flex flex-col gap-1">
      {m.inlineBotButtons!.map((row, i) => (
        <div key={i} className="flex gap-1">
          {row.map((b, j) =>
            b.type === "url" && b.data && /^https?:\/\//.test(b.data) ? (
              <a key={j} href={b.data} target="_blank" rel="noreferrer noopener" className="flex-1 rounded-md bg-black/20 px-2 py-1.5 text-center text-sm hover:bg-black/30">
                {b.text} ↗
              </a>
            ) : (
              <span key={j} className="flex-1 rounded-md bg-black/20 px-2 py-1.5 text-center text-sm">{b.text}</span>
            ),
          )}
        </div>
      ))}
    </div>
  );
}

export const Message = memo(MessageImpl);
