const timeFmt = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" });
const dayYearFmt = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" });
const shortFmt = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" });
const fullFmt = new Intl.DateTimeFormat("ru-RU", { dateStyle: "full", timeStyle: "medium" });

export const formatTime = (iso: string) => timeFmt.format(new Date(iso));
export const formatFull = (iso: string) => fullFmt.format(new Date(iso));
export const formatShortDate = (iso: string) => shortFmt.format(new Date(iso));

export function dayKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** "12 марта" for the current year, "12 марта 2019 г." otherwise — like Telegram. */
export function formatDay(iso: string) {
  const d = new Date(iso);
  return d.getFullYear() === new Date().getFullYear() ? dayFmt.format(d) : dayYearFmt.format(d);
}

export function formatSize(bytes: number | null | undefined) {
  if (!bytes) return "";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

export function formatDuration(seconds: number | null | undefined) {
  if (!seconds) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = String(seconds % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

export function initials(name: string | null | undefined) {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => [...w][0]?.toUpperCase())
    .join("");
}

const IMAGE_URL = /\.(jpe?g|png|gif|webp|avif|bmp)(\?[^#]*)?(#.*)?$/i;
export const isImageUrl = (url: string) => {
  try {
    return IMAGE_URL.test(new URL(url).pathname);
  } catch {
    return false;
  }
};

export const proxiedImage = (url: string) => `/api/img?url=${encodeURIComponent(url)}`;

const MEDIA_LABELS: Record<string, string> = {
  sticker: "Стикер",
  animation: "GIF",
  video_file: "Видео",
  video_message: "Видеосообщение",
  voice_message: "Голосовое сообщение",
  audio_file: "Аудио",
};

export function mediaLabel(mediaType: string | null, hasPhoto: boolean) {
  if (hasPhoto) return "Фотография";
  if (!mediaType) return null;
  return MEDIA_LABELS[mediaType] ?? "Файл";
}
