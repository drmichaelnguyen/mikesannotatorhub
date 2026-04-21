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
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {summary.days.map((day) => (
            <label key={day.day} className="block text-sm">
              <span className="text-[var(--muted)]">{formatDay(lang, day.day)}</span>
              <input
                name={`availability_${day.day}`}
                type="number"
                min={0}
                step={0.5}
                value={hours[day.day] ?? ""}
                onChange={(e) => setHours((prev) => ({ ...prev, [day.day]: e.target.value }))}
                placeholder="0"
                className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 tabular-nums"
              />
            </label>
          ))}
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
