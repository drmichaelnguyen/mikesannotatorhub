"use client";

import { useActionState, useMemo, useState } from "react";
import { importCaseStudyHistoryAction } from "@/app/actions/case-study-history";
import { parseCaseStudyHistoryTable } from "@/lib/case-study-history";
import type { DictKey, Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";

export function ImportCaseStudyHistoryForm({ lang }: { lang: Lang }) {
  const tk = (k: DictKey) => t(lang, k);
  const [pasteText, setPasteText] = useState("");
  const [state, formAction, pending] = useActionState(
    async (_: Awaited<ReturnType<typeof importCaseStudyHistoryAction>> | null, fd: FormData) => {
      return importCaseStudyHistoryAction(fd);
    },
    null as Awaited<ReturnType<typeof importCaseStudyHistoryAction>> | null,
  );

  const preview = useMemo(() => parseCaseStudyHistoryTable(pasteText), [pasteText]);

  return (
    <section className="space-y-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      <div>
        <h2 className="text-lg font-medium">{tk("case_study_history_import_title")}</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">{tk("case_study_history_import_hint")}</p>
      </div>

      <form action={formAction} className="space-y-3 rounded-md border border-[var(--border)] bg-[var(--bg)] p-3">
        <label htmlFor="case-study-history-paste" className="block text-sm text-[var(--muted)]">
          {tk("case_study_history_import_paste")}
        </label>
        <textarea
          id="case-study-history-paste"
          name="historyTable"
          rows={8}
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          placeholder={tk("case_study_history_import_placeholder")}
          className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-xs"
        />

        <label htmlFor="case-study-history-csv" className="mt-1 block text-xs text-[var(--muted)]">
          {tk("case_study_history_import_csv")}
        </label>
        <input
          id="case-study-history-csv"
          type="file"
          accept=".csv,text/csv,text/tab-separated-values,text/plain"
          className="block w-full text-sm"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const text = await file.text();
            setPasteText(text);
            e.target.value = "";
          }}
        />

        {pasteText.trim() !== "" && (
          <p className="text-sm text-[var(--muted)]">
            {tk("case_study_history_import_preview")}:{" "}
            <span className="font-medium text-[var(--text)]">{preview.length}</span>
            {preview.length > 0 && (
              <span className="mt-1 block font-mono text-xs">
                {preview
                  .slice(0, 8)
                  .map((r) => r.studyId)
                  .join(", ")}
                {preview.length > 8 ? ` (+${preview.length - 8})` : ""}
              </span>
            )}
          </p>
        )}

        {state?.ok && (
          <p className="text-sm text-[var(--accent)]">
            {tk("case_study_history_import_success")
              .replace("{imported}", String(state.imported))
              .replace("{updated}", String(state.updated))}
          </p>
        )}
        {state && !state.ok && (
          <p className="text-sm text-[var(--danger)]">
            {state.error === "empty"
              ? tk("case_study_history_import_empty")
              : tk("case_study_history_import_no_rows")}
          </p>
        )}

        <button
          type="submit"
          disabled={pending || pasteText.trim() === ""}
          className="rounded-md bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? tk("ui_loading") : tk("case_study_history_import_submit")}
        </button>
      </form>
    </section>
  );
}
