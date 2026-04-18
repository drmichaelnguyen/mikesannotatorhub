"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { assignCaseAction, submitAnnotationAction } from "@/app/actions/cases";
import type { AnnotationCase, Review } from "@prisma/client";
import type { DictKey, Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";

type Row = AnnotationCase & { reviews?: Review[] };

type SubmitResult = Awaited<ReturnType<typeof submitAnnotationAction>>;

export function AnnotatorCaseCard({
  lang,
  row,
  mode,
}: {
  lang: Lang;
  row: Row;
  mode: "available" | "mine" | "rejected";
}) {
  const tk = (k: DictKey) => t(lang, k);
  const [minutes, setMinutes] = useState(String(row.annotationMinutes ?? ""));
  const [assignState, assign, assignPending] = useActionState(async () => assignCaseAction(row.id), null as null | Awaited<ReturnType<typeof assignCaseAction>>);
  const [submitState, submit, submitPending] = useActionState(
    async (_: SubmitResult | null, fd: FormData) => {
      const m = Number(fd.get("minutes"));
      return submitAnnotationAction(row.id, m);
    },
    null as SubmitResult | null,
  );
  const router = useRouter();

  useEffect(() => {
    if (assignState?.ok) router.refresh();
  }, [assignState, router]);

  useEffect(() => {
    if (submitState?.ok) router.refresh();
  }, [submitState, router]);

  const last = row.reviews?.[0];

  return (
    <article className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-medium">{row.caseId}</h3>
          <p className="text-sm text-[var(--muted)]">{row.redbrickProject}</p>
        </div>
        <span className="rounded-full bg-[var(--bg)] px-2 py-0.5 text-xs">
          {tk(`status_${row.status}` as DictKey)}
        </span>
      </div>
      <dl className="mt-3 grid gap-1 text-sm text-[var(--muted)]">
        <div>
          <dt className="inline font-medium text-[var(--text)]">{tk("case_guideline")}: </dt>
          <dd className="inline">{row.guideline}</dd>
        </div>
        <div>
          <dt className="inline font-medium text-[var(--text)]">{tk("case_scope")}: </dt>
          <dd className="inline">{row.scopeOfWork}</dd>
        </div>
        <div>
          {tk("case_maxMinutes")}: {row.maxMinutesPerCase}
        </div>
      </dl>
      {last?.comment && (
        <p className="mt-2 rounded-md bg-[var(--bg)] p-2 text-sm">
          <span className="font-medium text-[var(--text)]">{tk("last_review")}: </span>
          {last.comment}
        </p>
      )}
      {assignState && !assignState.ok && (
        <p className="mt-2 text-sm text-[var(--danger)]">{tk("required")}</p>
      )}
      {mode === "available" && (
        <form action={assign} className="mt-3">
          <button
            type="submit"
            disabled={assignPending}
            className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm text-white disabled:opacity-50"
          >
            {tk("assign")}
          </button>
        </form>
      )}
      {(mode === "mine" || mode === "rejected") &&
        (row.status === "ASSIGNED" || row.status === "REJECTED") && (
          <form action={submit} className="mt-3 flex flex-wrap items-end gap-2">
            <label className="text-sm">
              <span className="text-[var(--muted)]">{tk("minutes_spent")}</span>
              <input
                name="minutes"
                type="number"
                min={1}
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
                className="ml-2 w-24 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1"
              />
            </label>
            <button
              type="submit"
              disabled={submitPending || !minutes}
              className="rounded-md bg-[var(--success)] px-3 py-1.5 text-sm text-white disabled:opacity-50"
            >
              {tk("submit")}
            </button>
          </form>
        )}
      {submitState && !submitState.ok && (
        <p className="mt-2 text-sm text-[var(--danger)]">{tk("required")}</p>
      )}
    </article>
  );
}
