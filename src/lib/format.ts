import type { Lang } from "@/lib/i18n";

export function formatDate(lang: Lang, d: Date | string | null | undefined) {
  if (d == null || d === "") return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleString(lang === "vi" ? "vi-VN" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
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
