import type { Lang } from "@/lib/i18n";

export function formatDate(lang: Lang, d: Date | null | undefined) {
  if (!d) return "—";
  return d.toLocaleString(lang === "vi" ? "vi-VN" : "en-US", {
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
