"use client";

import { useState } from "react";
import { formatDuration, formatSize } from "@/lib/format";
import type { MessageDto } from "@/lib/types";

const MAX_W = 340;
const MAX_H = 380;

/** Fit width/height into the bubble the way Telegram does. */
function fit(width: number | null, height: number | null, maxW = MAX_W, maxH = MAX_H) {
  if (!width || !height) return { width: maxW, height: Math.round(maxW * 0.66) };
  const scale = Math.min(maxW / width, maxH / height, 1);
  return { width: Math.max(Math.round(width * scale), 120), height: Math.max(Math.round(height * scale), 80) };
}

function Unavailable({ icon, label, size, width, height, round, badge }: {
  icon: string;
  label: string;
  size?: string;
  width: number;
  height: number;
  round?: boolean;
  badge?: string;
}) {
  return (
    <div
      style={{ width, height }}
      className={`relative flex flex-col items-center justify-center gap-1 overflow-hidden bg-gradient-to-br from-[#1f3449] to-[#13202d] text-center ${round ? "rounded-full" : ""}`}
    >
      <span className="text-4xl opacity-70">{icon}</span>
      <span className="px-3 text-xs text-tg-muted">{label}</span>
      {size && <span className="text-[11px] text-tg-muted/80">{size}</span>}
      {badge && (
        <span className="absolute top-2 left-2 rounded-md bg-black/45 px-1.5 py-0.5 text-[11px] text-white">{badge}</span>
      )}
    </div>
  );
}

function SpoilerCover({ children }: { children: React.ReactNode }) {
  const [hidden, setHidden] = useState(true);
  return (
    <div className="relative" onClick={() => setHidden(false)}>
      <div className={hidden ? "blur-xl" : undefined}>{children}</div>
      {hidden && <div className="absolute inset-0 flex cursor-pointer items-center justify-center text-sm text-white/80">Спойлер</div>}
    </div>
  );
}

function Waveform({ seed }: { seed: number }) {
  // Deterministic fake waveform: the export has no waveform data.
  const bars = Array.from({ length: 36 }, (_, i) => 3 + (((seed * (i + 7) * 2654435761) >>> 0) % 17));
  return (
    <div className="flex h-5 items-end gap-[2px]">
      {bars.map((h, i) => (
        <span key={i} style={{ height: h }} className="w-[2px] rounded-full bg-current opacity-60" />
      ))}
    </div>
  );
}

/** Renders the visual media of a message (photo, video, sticker, voice, file). Returns null if there is none. */
export function MessageMedia({ m }: { m: MessageDto }) {
  const sizeLabel = formatSize(m.photoFileSize ?? m.fileSize);
  const missing = "Нет в экспорте";

  if (m.photoFileSize !== null || m.photoUrl) {
    const box = fit(m.width, m.height);
    const content = m.photoUrl ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={m.photoUrl} alt="" loading="lazy" style={box} className="object-cover" />
    ) : (
      <Unavailable icon="🖼️" label={`Фото · ${missing}`} size={sizeLabel} {...box} />
    );
    return m.mediaSpoiler ? <SpoilerCover>{content}</SpoilerCover> : content;
  }

  switch (m.mediaType) {
    case "sticker": {
      if (m.fileUrl && m.mimeType?.startsWith("image/")) {
        // eslint-disable-next-line @next/next/no-img-element
        return <img src={m.fileUrl} alt={m.stickerEmoji ?? "sticker"} loading="lazy" className="size-40 object-contain" />;
      }
      return (
        <div className="flex size-40 items-center justify-center text-[96px] leading-none select-none" title="Стикер">
          {m.stickerEmoji ?? "🗒️"}
        </div>
      );
    }
    case "animation":
    case "video_file": {
      const box = fit(m.width, m.height);
      const badge = m.mediaType === "animation" ? "GIF" : formatDuration(m.durationSeconds);
      if (m.fileUrl) {
        return m.mediaType === "animation" ? (
          <video src={m.fileUrl} style={box} autoPlay loop muted playsInline className="object-cover" />
        ) : (
          <video src={m.fileUrl} style={box} controls preload="metadata" className="bg-black object-contain" />
        );
      }
      return <Unavailable icon="▶️" label={`${m.mediaType === "animation" ? "GIF" : "Видео"} · ${missing}`} size={sizeLabel} badge={badge} {...box} />;
    }
    case "video_message":
      if (m.fileUrl) return <video src={m.fileUrl} controls className="size-56 rounded-full object-cover" />;
      return <Unavailable icon="🎥" label={formatDuration(m.durationSeconds)} width={224} height={224} round />;
    case "voice_message":
      return (
        <div className="flex w-64 items-center gap-3 py-1">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-tg-accent text-lg text-white">▶</div>
          <div className="min-w-0 flex-1">
            {m.fileUrl ? <audio src={m.fileUrl} controls className="h-8 w-full" /> : <Waveform seed={m.id} />}
            <div className="mt-1 text-xs text-tg-muted">
              {formatDuration(m.durationSeconds)}{!m.fileUrl && ` · ${missing}`}
            </div>
          </div>
        </div>
      );
  }

  if (m.fileName || m.fileSize !== null) {
    const isAudio = m.mediaType === "audio_file";
    return (
      <div className="flex max-w-80 items-center gap-3 py-1">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-tg-accent text-lg text-white">
          {isAudio ? "♫" : "📄"}
        </div>
        <div className="min-w-0">
          {m.fileUrl ? (
            <a href={m.fileUrl} target="_blank" rel="noreferrer" className="block truncate font-medium text-tg-link">
              {m.fileName ?? "Файл"}
            </a>
          ) : (
            <div className="truncate font-medium">{m.fileName ?? "Файл"}</div>
          )}
          <div className="text-xs text-tg-muted">
            {[sizeLabel, isAudio && formatDuration(m.durationSeconds), !m.fileUrl && missing].filter(Boolean).join(" · ")}
          </div>
        </div>
      </div>
    );
  }
  return null;
}

/** True for media that is shown without a bubble (stickers, round videos). */
export const isBubbleless = (m: MessageDto) =>
  (m.mediaType === "sticker" || m.mediaType === "video_message") && !m.textPlain && !m.reply && !m.forwardedFrom;

/** True for media that fills the bubble edge to edge. */
export const isFullBleed = (m: MessageDto) =>
  m.photoFileSize !== null || !!m.photoUrl || m.mediaType === "video_file" || m.mediaType === "animation";
