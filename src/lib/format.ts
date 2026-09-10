import type { Lang } from "@/lib/i18n";

export function formatDate(lang: Lang, d: Date | string | null | undefined) {
  if (d == null || d === "") return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleString(lang === "vi" ? "vi-VN" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    // Fixed zone so Node SSR and the browser render the same string (avoids hydration mismatch).
    timeZone: "UTC",
  });
}

export function formatCompensationAmount(lang: Lang, value: number) {
  return new Intl.NumberFormat(lang === "vi" ? "vi-VN" : "en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatMinutes(lang: Lang, value: number | null) {
  if (value == null) return "—";
  return `${new Intl.NumberFormat(lang === "vi" ? "vi-VN" : "en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value)} min`;
}

export function formatHours(lang: Lang, value: number | null) {
  if (value == null) return "—";
  return `${new Intl.NumberFormat(lang === "vi" ? "vi-VN" : "en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value)} h`;
}

/** Value for `<input type="datetime-local">` in the browser's local timezone. */
export function toDatetimeLocalValue(d: Date | string | null | undefined): string {
  if (d == null || d === "") return "";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

/** Parse a datetime-local form value into a Date, or null if blank/invalid. */
export function parseDatetimeLocalValue(raw: string): Date | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}
