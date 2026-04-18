"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { reviewerAssignCaseAction } from "@/app/actions/cases";
import type { DictKey, Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";

export function ReviewerAssignCase({
  lang,
  caseDbId,
  annotators,
}: {
  lang: Lang;
  caseDbId: string;
  annotators: { id: string; name: string; email: string }[];
}) {
  const tk = (k: DictKey) => t(lang, k);
  const router = useRouter();
  const [annotatorId, setAnnotatorId] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    setErr(null);
    start(async () => {
      const res = await reviewerAssignCaseAction(caseDbId, annotatorId);
      if (!res.ok) {
        if (res.error === "invalid_annotator") setErr(tk("reviewer_assign_invalid"));
        else if (res.error === "required") setErr(tk("required"));
        else setErr(tk("reviewer_assign_taken"));
        return;
      }
      setAnnotatorId("");
      router.refresh();
    });
  }

  if (annotators.length === 0) {
    return (
      <p className="mt-3 text-sm text-[var(--muted)]">{tk("reviewer_assign_no_annotators")}</p>
    );
  }

  return (
    <div className="mt-3 rounded-md border border-[var(--border)] bg-[var(--bg)] p-3">
      <p className="mb-2 text-sm font-medium">{tk("reviewer_assign_heading")}</p>
      <p className="mb-2 text-xs text-[var(--muted)]">{tk("reviewer_assign_help")}</p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[220px] flex-1 text-sm">
          <span className="text-[var(--muted)]">{tk("reviewer_assign_select")}</span>
          <select
            value={annotatorId}
            onChange={(e) => setAnnotatorId(e.target.value)}
            className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5"
          >
            <option value="">{tk("reviewer_assign_placeholder")}</option>
            {annotators.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.email})
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={pending || !annotatorId}
          onClick={submit}
          className="rounded-md bg-[var(--accent)] px-3 py-2 text-sm text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
        >
          {tk("reviewer_assign_submit")}
        </button>
      </div>
      {err && <p className="mt-2 text-sm text-[var(--danger)]">{err}</p>}
    </div>
  );
}
