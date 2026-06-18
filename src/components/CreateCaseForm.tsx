"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useState } from "react";
import { createCaseAction, type CreateCaseActionResult } from "@/app/actions/cases";
import { matchContinuityReportFileToCaseId } from "@/lib/continuity-report-filename";
import type { GuideOptionLite, TopicOptionLite } from "@/lib/guide-topic";
import type { DictKey, Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";

function formatIdList(ids: string[], max = 40) {
  if (ids.length === 0) return "";
  const shown = ids.slice(0, max);
  const extra = ids.length > max ? ` (+${ids.length - max})` : "";
  return `${shown.join(", ")}${extra}`;
}

type Annotator = { id: string; name: string; email: string };

type GuideSelectOption = GuideOptionLite;

export function CreateCaseForm({
  lang,
  annotators = [],
  guides = [],
  topics = [],
  scopeOptions = [],
}: {
  lang: Lang;
  annotators?: Annotator[];
  guides?: GuideSelectOption[];
  topics?: TopicOptionLite[];
  scopeOptions?: string[];
}) {
  const tk = (k: DictKey) => t(lang, k);
  const router = useRouter();
  const [redbrickProject, setRedbrickProject] = useState("");
  const [guideId, setGuideId] = useState("");
  const [guideline, setGuideline] = useState("");
  const [scopeOfWork, setScopeOfWork] = useState("");
  const [minMinutesPerCase, setMinMinutesPerCase] = useState("");
  const [maxMinutesPerCase, setMaxMinutesPerCase] = useState("");
  const [compensationType, setCompensationType] = useState<"PER_CASE" | "PER_MINUTE">("PER_CASE");
  const [compensationAmount, setCompensationAmount] = useState("");
  const [assignEmail, setAssignEmail] = useState("");
  const [caseIdsText, setCaseIdsText] = useState("");
  const [continuityFiles, setContinuityFiles] = useState<File[]>([]);

  const batchCaseIds = useMemo(() => {
    const tokens = caseIdsText
      .split(/[\r\n,;\t]+/g)
      .map((s) => s.trim())
      .filter(Boolean);
    return [...new Set(tokens)];
  }, [caseIdsText]);

  const continuityPreview = useMemo(() => {
    const matched: { caseId: string; filename: string }[] = [];
    const unmatched: string[] = [];
    const usedCaseIds = new Set<string>();
    for (const file of continuityFiles) {
      const caseId = matchContinuityReportFileToCaseId(file.name, batchCaseIds);
      if (!caseId || usedCaseIds.has(caseId)) {
        unmatched.push(file.name);
        continue;
      }
      usedCaseIds.add(caseId);
      matched.push({ caseId, filename: file.name });
    }
    return { matched, unmatched };
  }, [continuityFiles, batchCaseIds]);

  const visibleGuides = guides;
  const visibleTopics = useMemo(
    () =>
      topics.filter(
        (topic) =>
          (topic.projects.length === 0 ||
            !redbrickProject.trim() ||
            topic.projects.some((p) => p.redbrickProject === redbrickProject.trim())) &&
          (topic.scopes.length === 0 ||
            !scopeOfWork.trim() ||
            topic.scopes.some((s) => s.scopeOfWork === scopeOfWork.trim())),
      ),
    [topics, redbrickProject, scopeOfWork],
  );

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
    <form
      action={formAction}
      encType="multipart/form-data"
      className="grid gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 md:grid-cols-2"
    >
      <div className="md:col-span-2">
        <label htmlFor="create-case-ids" className="text-sm text-[var(--muted)]">
          {tk("case_ids_batch")}
        </label>
        <p className="mt-0.5 text-xs text-[var(--muted)]">{tk("batch_ids_hint")}</p>
        <textarea
          id="create-case-ids"
          name="caseIds"
          required
          rows={8}
          value={caseIdsText}
          onChange={(e) => setCaseIdsText(e.target.value)}
          placeholder={"CASE-001\nCASE-002"}
          className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 font-mono text-sm"
        />
      </div>
      <div className="md:col-span-2">
        <label htmlFor="create-case-continuity-reports" className="text-sm text-[var(--muted)]">
          {tk("case_continuity_report_upload")}
        </label>
        <p className="mt-0.5 text-xs text-[var(--muted)]">{tk("case_continuity_report_upload_hint")}</p>
        <input
          id="create-case-continuity-reports"
          type="file"
          name="continuityReports"
          multiple
          accept=".html,text/html"
          className="mt-2 block w-full text-sm"
          onChange={(e) => setContinuityFiles(Array.from(e.target.files ?? []))}
          {...({ webkitdirectory: "", directory: "" } as React.InputHTMLAttributes<HTMLInputElement>)}
        />
        {(continuityPreview.matched.length > 0 || continuityPreview.unmatched.length > 0) && (
          <div className="mt-2 space-y-2 rounded-md border border-[var(--border)] bg-[var(--bg)] p-3 text-xs">
            {continuityPreview.matched.length > 0 && (
              <div>
                <p className="font-medium text-[var(--text)]">{tk("case_continuity_report_preview_matched")}</p>
                <ul className="mt-1 list-disc pl-4 text-[var(--muted)]">
                  {continuityPreview.matched.map((row) => (
                    <li key={`${row.caseId}-${row.filename}`}>
                      <span className="font-mono text-[var(--text)]">{row.caseId}</span>
                      <span className="text-[var(--muted)]"> ← {row.filename}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {continuityPreview.unmatched.length > 0 && (
              <div>
                <p className="font-medium text-[var(--warn)]">{tk("case_continuity_report_preview_unmatched")}</p>
                <p className="mt-1 text-[var(--muted)]">{formatIdList(continuityPreview.unmatched, 8)}</p>
              </div>
            )}
          </div>
        )}
      </div>
      <label className="md:col-span-2">
        <span className="text-sm text-[var(--muted)]">{tk("case_redbrick")}</span>
        <input
          name="redbrickProject"
          required
          value={redbrickProject}
          onChange={(e) => setRedbrickProject(e.target.value)}
          className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
        />
      </label>
      <label>
        <span className="text-sm text-[var(--muted)]">{tk("case_guide")}</span>
        <select
          name="guideId"
          value={guideId}
          onChange={(e) => setGuideId(e.target.value)}
          className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
        >
          <option value="">—</option>
          {visibleGuides.map((guide) => (
            <option key={guide.id} value={guide.id}>
              {guide.title}
            </option>
          ))}
        </select>
      </label>
      <div className="md:col-span-2">
        <span className="text-sm text-[var(--muted)]">{tk("case_topic")}</span>
        <p className="mt-0.5 text-xs text-[var(--muted)]">{tk("case_topic_multi_hint")}</p>
        <div className="mt-2 max-h-48 space-y-2 overflow-y-auto rounded-md border border-[var(--border)] bg-[var(--bg)] p-2">
          {visibleTopics.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">—</p>
          ) : (
            visibleTopics.map((topic) => (
              <label key={topic.id} className="flex cursor-pointer items-start gap-2 text-sm">
                <input type="checkbox" name="topicIds" value={topic.id} className="mt-1" />
                <span>{topic.name}</span>
              </label>
            ))
          )}
        </div>
      </div>
      <label className="md:col-span-2">
        <span className="text-sm text-[var(--muted)]">{tk("case_guideline")}</span>
        <textarea
          name="guideline"
          rows={3}
          value={guideline}
          onChange={(e) => setGuideline(e.target.value)}
          className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
        />
      </label>
      <div className="md:col-span-2">
        <label htmlFor="create-case-video-guides" className="text-sm text-[var(--muted)]">
          {tk("case_videos")}
        </label>
        <textarea
          id="create-case-video-guides"
          name="videoGuideUrls"
          rows={3}
          placeholder="https://..."
          className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 font-mono text-sm"
        />
        <p className="mt-1 text-xs text-[var(--muted)]">{tk("case_video_guides_hint")}</p>
      </div>
      <div className="md:col-span-2">
        <label htmlFor="create-case-scope" className="text-sm text-[var(--muted)]">
          {tk("case_scope")}
        </label>
        <input
          id="create-case-scope"
          list="scope-options-create"
          name="scopeOfWork"
          required
          value={scopeOfWork}
          onChange={(e) => setScopeOfWork(e.target.value)}
          className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
        />
        <datalist id="scope-options-create">
          {scopeOptions.map((scope) => (
            <option key={scope} value={scope} />
          ))}
        </datalist>
        <p className="mt-1 text-xs text-[var(--muted)]">{tk("case_scope_hint")}</p>
      </div>
      <label>
        <span className="text-sm text-[var(--muted)]">{tk("case_minMinutes_recommended")}</span>
        <input
          name="minMinutesPerCase"
          type="number"
          min={1}
          required
          value={minMinutesPerCase}
          onChange={(e) => setMinMinutesPerCase(e.target.value)}
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
          value={maxMinutesPerCase}
          onChange={(e) => setMaxMinutesPerCase(e.target.value)}
          className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
        />
      </label>
      <label>
        <span className="text-sm text-[var(--muted)]">{tk("case_compType")}</span>
        <select
          name="compensationType"
          value={compensationType}
          onChange={(e) => setCompensationType(e.target.value as "PER_CASE" | "PER_MINUTE")}
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
          value={compensationAmount}
          onChange={(e) => setCompensationAmount(e.target.value)}
          className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
        />
      </label>
      <label>
        <span className="text-sm text-[var(--muted)]">{tk("assign_email")}</span>
        <select
          name="assignEmail"
          value={assignEmail}
          onChange={(e) => setAssignEmail(e.target.value)}
          className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
        >
          <option value="">— {tk("unassigned")} —</option>
          {annotators.map((a) => (
            <option key={a.id} value={a.email}>
              {a.name} ({a.email})
            </option>
          ))}
        </select>
      </label>
      {state && !state.ok && (
        <p className="md:col-span-2 text-sm text-[var(--danger)]">
          {state.error === "no_ids"
            ? tk("no_valid_ids")
            : state.error === "limits"
              ? tk("case_limits_invalid")
              : state.error === "scope_words"
                ? tk("scope_word_limit")
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
          {state.continuityReportsAttached > 0 && (
            <p>
              <span className="text-[var(--muted)]">{tk("batch_result_reports_attached")}: </span>
              <span className="font-medium text-[var(--text)]">{state.continuityReportsAttached}</span>
            </p>
          )}
          {state.continuityReportsUnmatched.length > 0 && (
            <p>
              <span className="text-[var(--muted)]">{tk("case_continuity_report_preview_unmatched")}: </span>
              <span className="text-[var(--warn)]">{formatIdList(state.continuityReportsUnmatched, 8)}</span>
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
