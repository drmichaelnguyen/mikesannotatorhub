import type { Lang } from "@/lib/i18n";

export function formatDate(lang: Lang, d: Date | null | undefined) {
  if (!d) return "—";
  return d.toLocaleString(lang === "vi" ? "vi-VN" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
