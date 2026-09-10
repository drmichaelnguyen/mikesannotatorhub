"use client";

import { useActionState, useEffect } from "react";
import { updateDefaultCompensationSettingAction } from "@/app/actions/settings";
import { formatCompensationAmount } from "@/lib/format";
import type { DictKey, Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";

export function DefaultCompensationSetting({
  lang,
  perMinuteRate,
}: {
  lang: Lang;
  perMinuteRate: number | null;
}) {
  const tk = (k: DictKey) => t(lang, k);
  const [state, formAction, pending] = useActionState(
    async (_: Awaited<ReturnType<typeof updateDefaultCompensationSettingAction>> | null, fd: FormData) => {
      return updateDefaultCompensationSettingAction(fd);
    },
    null as Awaited<ReturnType<typeof updateDefaultCompensationSettingAction>> | null,
  );

  useEffect(() => {
    if (state?.ok) window.location.reload();
  }, [state]);

  return (
    <section className="space-y-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      <div>
        <h2 className="text-lg font-medium">{tk("reviewer_default_rate_section")}</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">{tk("reviewer_default_rate_hint")}</p>
        {perMinuteRate != null && (
          <p className="mt-2 text-sm text-[var(--text)]">
            {tk("reviewer_default_rate_current")}:{" "}
            <span className="font-medium tabular-nums">
              {formatCompensationAmount(lang, perMinuteRate)} / {tk("pay_calc_minutes_unit")}
            </span>
          </p>
        )}
      </div>

      <form action={formAction} className="space-y-3 rounded-md border border-[var(--border)] bg-[var(--bg)] p-3">
        <label className="block text-sm">
          <span className="text-[var(--muted)]">{tk("reviewer_default_rate_label")}</span>
          <input
            name="perMinuteRate"
            type="number"
            min={0}
            step="0.01"
            required
            defaultValue={perMinuteRate ?? ""}
            className="mt-1 w-full max-w-xs rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
          />
        </label>
        {state && !state.ok && (
          <p className="text-sm text-[var(--danger)]">
            {state.error === "invalid" ? tk("reviewer_default_rate_invalid") : tk("required")}
          </p>
        )}
        {state?.ok && (
          <p className="text-sm text-[var(--success)]">{tk("reviewer_default_rate_saved")}</p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
        >
          {tk("reviewer_default_rate_save")}
        </button>
      </form>
    </section>
  );
}
