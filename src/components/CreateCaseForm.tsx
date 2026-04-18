"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { createCaseAction, type CreateCaseActionResult } from "@/app/actions/cases";
import type { DictKey, Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";

function formatIdList(ids: string[], max = 40) {
  if (ids.length === 0) return "";
  const shown = ids.slice(0, max);
  const extra = ids.length > max ? ` (+${ids.length - max})` : "";
  return `${shown.join(", ")}${extra}`;
}

export function CreateCaseForm({ lang }: { lang: Lang }) {
  const tk = (k: DictKey) => t(lang, k);
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    async (_: CreateCaseActionResult | null, fd: FormData) => {
      return createCaseAction(fd);
    },
    null as CreateCaseActionResult | null,
  );

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  return (
    <form action={formAction} className="grid gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 md:grid-cols-2">
      <label className="md:col-span-2">
        <span className="text-sm text-[var(--muted)]">{tk("case_ids_batch")}</span>
        <p className="mt-0.5 text-xs text-[var(--muted)]">{tk("batch_ids_hint")}</p>
        <textarea
          name="caseIds"
          required
          rows={8}
          placeholder={"CASE-001\nCASE-002"}
          className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 font-mono text-sm"
        />
      </label>
      <label className="md:col-span-2">
        <span className="text-sm text-[var(--muted)]">{tk("case_redbrick")}</span>
        <input
          name="redbrickProject"
          required
          className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
        />
      </label>
      <label className="md:col-span-2">
        <span className="text-sm text-[var(--muted)]">{tk("case_guideline")}</span>
        <textarea
          name="guideline"
          required
          rows={3}
          className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
        />
      </label>
      <label className="md:col-span-2">
        <span className="text-sm text-[var(--muted)]">{tk("case_scope")}</span>
        <textarea
          name="scopeOfWork"
          required
          rows={3}
          className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
        />
      </label>
      <label>
        <span className="text-sm text-[var(--muted)]">{tk("case_minMinutes_recommended")}</span>
        <input
          name="minMinutesPerCase"
          type="number"
          min={1}
          required
          className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
        />
      </label>
      <label>
        <span className="text-sm text-[var(--muted)]">{tk("case_maxMinutes")}</span>
        <input
          name="maxMinutesPerCase"
          type="number"
          min={1}
          required
          className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
        />
      </label>
      <label>
        <span className="text-sm text-[var(--muted)]">{tk("case_compType")}</span>
        <select
          name="compensationType"
          className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
        >
          <option value="PER_CASE">{tk("comp_per_case")}</option>
          <option value="PER_MINUTE">{tk("comp_per_minute")}</option>
        </select>
      </label>
      <label>
        <span className="text-sm text-[var(--muted)]">{tk("case_compAmount")}</span>
        <input
          name="compensationAmount"
          type="number"
          min={0}
          step="0.01"
          required
          className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
        />
      </label>
      <label>
        <span className="text-sm text-[var(--muted)]">{tk("assign_email")}</span>
        <input
          name="assignEmail"
          type="email"
          placeholder="annotator@example.com"
          className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
        />
      </label>
      {state && !state.ok && (
        <p className="md:col-span-2 text-sm text-[var(--danger)]">
          {state.error === "no_ids"
            ? tk("no_valid_ids")
            : state.error === "limits"
              ? tk("case_limits_invalid")
              : tk("required")}
        </p>
      )}
      {state?.ok && (
        <div className="md:col-span-2 space-y-2 rounded-md border border-[var(--border)] bg-[var(--bg)] p-3 text-sm">
          <p>
            <span className="text-[var(--muted)]">{tk("batch_result_created")}: </span>
            <span className="font-medium text-[var(--text)]">{state.created}</span>
          </p>
          {state.skippedExisting.length > 0 && (
            <p>
              <span className="text-[var(--muted)]">{tk("batch_result_skipped")}: </span>
              <span className="text-[var(--warn)]">{formatIdList(state.skippedExisting)}</span>
            </p>
          )}
          {state.duplicateInList.length > 0 && (
            <p>
              <span className="text-[var(--muted)]">{tk("batch_result_dupes")}: </span>
              <span className="text-[var(--muted)]">{formatIdList(state.duplicateInList)}</span>
            </p>
          )}
        </div>
      )}
      <div className="md:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-[var(--accent)] px-4 py-2 text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
        >
          {tk("create_submit")}
        </button>
      </div>
    </form>
  );
}
