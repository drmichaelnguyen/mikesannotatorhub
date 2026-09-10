"use client";
import type { Lang } from "@/lib/i18n";

export function CaseQualityBonusField({ lang, idPrefix, value, onChange, hint, required = true, placeholder }: {
  lang: Lang; idPrefix: string; value: string; onChange: (value: string) => void;
  hint: string; required?: boolean; placeholder?: string;
}) {
  return (
    <label className="md:col-span-2 rounded-md border border-[var(--border)] bg-[var(--bg)] p-3">
      <span className="text-sm font-medium">{lang === "vi" ? "Thưởng chất lượng 5★ cho các ca này (%)" : "5★ quality bonus for these cases (%)"}</span>
      <input
        id={`${idPrefix}-quality-bonus`}
        name="fiveStarBonusPercent"
        type="number"
        min={0}
        max={100}
        step="0.01"
        required={required}
        placeholder={placeholder}
        value={value}
        onChange={event => onChange(event.target.value)}
        aria-describedby={`${idPrefix}-quality-bonus-hint`}
        className="mt-2 block w-36 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
      />
      <span id={`${idPrefix}-quality-bonus-hint`} className="mt-2 block text-xs text-[var(--muted)]">
        {hint}
      </span>
    </label>
  );
}
