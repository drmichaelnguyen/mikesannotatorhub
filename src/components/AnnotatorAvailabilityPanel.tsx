"use client";

import { useActionState, useEffect, useState } from "react";
import type { AnnotatorAvailabilitySummary } from "@/app/actions/cases";
import { saveAnnotatorAvailabilityAction } from "@/app/actions/cases";
import type { DictKey, Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";

function formatDay(lang: Lang, day: string) {
  const dt = new Date(`${day}T12:00:00Z`);
  return new Intl.DateTimeFormat(lang === "vi" ? "vi-VN" : "en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(dt);
}

function weekdayLabel(lang: Lang, day: string) {
  const dt = new Date(`${day}T12:00:00Z`);
  return new Intl.DateTimeFormat(lang === "vi" ? "vi-VN" : "en-US", {
    weekday: "short",
  }).format(dt);
}

function localDayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function AnnotatorAvailabilityPanel({
  lang,
  summary,
}: {
  lang: Lang;
  summary: AnnotatorAvailabilitySummary;
}) {
  const tk = (k: DictKey) => t(lang, k);
  const [state, action, pending] = useActionState(
    async (_: Awaited<ReturnType<typeof saveAnnotatorAvailabilityAction>> | null, fd: FormData) => {
      return saveAnnotatorAvailabilityAction(fd);
    },
    null as Awaited<ReturnType<typeof saveAnnotatorAvailabilityAction>> | null,
  );
  const [hours, setHours] = useState<Record<string, string>>(() =>
    Object.fromEntries(summary.days.map((d) => [d.day, String(d.availableHours || "")])),
  );
  const todayKey = localDayKey();

  useEffect(() => {
    setHours(Object.fromEntries(summary.days.map((d) => [d.day, String(d.availableHours || "")])));
  }, [summary.days]);

  useEffect(() => {
    if (state?.ok) window.location.reload();
  }, [state]);

  return (
    <section className="space-y-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      <div>
        <h2 className="text-lg font-medium">{tk("availability_title")}</h2>
        <p className="text-xs text-[var(--muted)]">{tk("availability_hint")}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3">
          <p className="text-xs text-[var(--muted)]">{tk("availability_total")}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{summary.availableHours.toFixed(1)}h</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3">
          <p className="text-xs text-[var(--muted)]">{tk("availability_assigned")}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{summary.assignedEstimateHours.toFixed(1)}h</p>
          <p className="mt-1 text-xs text-[var(--muted)]">{summary.assignedCaseCount} {tk("availability_cases")}</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3">
          <p className="text-xs text-[var(--muted)]">{tk("availability_remaining")}</p>
          <p className={`mt-1 text-2xl font-semibold tabular-nums ${summary.remainingHours < 0 ? "text-[var(--danger)]" : "text-[var(--success)]"}`}>
            {summary.remainingHours.toFixed(1)}h
          </p>
        </div>
      </div>

      <form
        action={action}
        className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3"
      >
        <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
          <div className="min-w-[980px]">
          <div className="grid grid-cols-7 border-b border-[var(--border)] bg-[var(--bg)] text-center text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
            {summary.days.map((day) => (
              <div key={`head-${day.day}`} className="px-2 py-2">
                {weekdayLabel(lang, day.day)}
              </div>
            ))}
          </div>
          <div className="grid gap-px bg-[var(--border)] lg:grid-cols-7">
            {summary.days.map((day) => (
              <label
                key={day.day}
                className={`flex min-h-32 flex-col bg-[var(--surface)] p-3 text-sm transition ${
                  day.day === todayKey
                    ? "bg-[var(--accent)]/8"
                    : "hover:bg-[var(--bg)]/70"
                }`}
              >
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium text-[var(--text)]">{formatDay(lang, day.day)}</span>
                {day.day === todayKey && (
                  <span className="rounded-full bg-[var(--accent)] px-2 py-0.5 text-[10px] font-semibold text-white">
                    {tk("availability_today")}
                  </span>
                )}
              </div>
              <span className="mt-1 text-xs text-[var(--muted)]">{day.day}</span>
              <div className="mt-3 flex-1">
                <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2">
                  <input
                    name={`availability_${day.day}`}
                    type="number"
                    min={0}
                    step={0.5}
                    value={hours[day.day] ?? ""}
                    onChange={(e) => setHours((prev) => ({ ...prev, [day.day]: e.target.value }))}
                    placeholder="0"
                    className="w-full bg-transparent text-center text-2xl font-semibold tabular-nums outline-none"
                  />
                  <p className="mt-1 text-center text-xs text-[var(--muted)]">{tk("availability_hours")}</p>
                </div>
              </div>
              </label>
            ))}
          </div>
          </div>
        </div>
        {state && !state.ok && (
          <p className="text-sm text-[var(--danger)]">{tk("required")}</p>
        )}
        <div className="flex items-center justify-end">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
          >
            {tk("availability_save")}
          </button>
        </div>
      </form>
    </section>
  );
}
