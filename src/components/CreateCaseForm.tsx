"use client";

import { CaseQualityBonusField } from "@/components/CaseQualityBonusField";
import { CaseTimingFields } from "@/components/CaseTimingFields";
import { suggestedCaseBonusPercent, type CaseBonusDefault } from "@/lib/project-quality-bonus";
import { createCaseErrorMessage } from "@/lib/create-case-errors";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useRef, useState, type InputHTMLAttributes } from "react";
import { createCaseAction, type CreateCaseActionResult } from "@/app/actions/cases";
import {
  CaseDetailsFields,
  type CaseDetailsFieldsValue,
} from "@/components/CaseDetailsFields";
import { matchContinuityReportFileToCaseId } from "@/lib/continuity-report-filename";
import {
  findingsMapToJson,
  looksLikeRadiologistFindingsTable,
  matchFindingsToCaseIds,
  parseRadiologistFindingsTable,
} from "@/lib/radiologist-findings";
import type { GuideOptionLite, TopicOptionLite } from "@/lib/guide-topic";
import { formatCompensationAmount } from "@/lib/format";
import type { DictKey, Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";

function formatIdList(ids: string[], max = 40) {
  if (ids.length === 0) return "";
  const shown = ids.slice(0, max);
  const extra = ids.length > max ? ` (+${ids.length - max})` : "";
  return `${shown.join(", ")}${extra}`;
}

const DEFAULT_DEADLINE_HOURS = 72;
const DEFAULT_EXPIRY_GRACE_HOURS = 8;

type Annotator = { id: string; name: string; email: string };

const EMPTY_DETAILS: CaseDetailsFieldsValue = {
  project: "",
  redbrickProject: "",
  guideId: "",
  topicIds: [],
  guideline: "",
  radiologistFinding: "",
  videoGuideUrls: "",
  scopeOfWork: "",
  minMinutesPerCase: "",
  maxMinutesPerCase: "",
  compensationType: "PER_MINUTE",
  compensationAmount: "",
};

export function CreateCaseForm({
  lang,
  annotators = [],
  guides = [],
  topics = [],
  scopeOptions = [],
  projectOptions = [],
  rbProjectOptions = [],
  defaultPerMinuteRate = null,
  bonusDefaults = { projects: [], scopes: [] },
}: {
  lang: Lang;
  annotators?: Annotator[];
  guides?: GuideOptionLite[];
  topics?: TopicOptionLite[];
  scopeOptions?: string[];
  projectOptions?: string[];
  rbProjectOptions?: string[];
  defaultPerMinuteRate?: number | null;
  bonusDefaults?: { projects: { project: string; percent: number }[]; scopes: CaseBonusDefault[] };
}) {
  const tk = (k: DictKey) => t(lang, k);
  const router = useRouter();
  const errorRef = useRef<HTMLDivElement>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const [bonusOverride, setBonusOverride] = useState<string | null>(null);
  const [details, setDetails] = useState<CaseDetailsFieldsValue>(EMPTY_DETAILS);
  const [deadlineHours, setDeadlineHours] = useState(DEFAULT_DEADLINE_HOURS);
  const [expiryGraceHours, setExpiryGraceHours] = useState(DEFAULT_EXPIRY_GRACE_HOURS);
  const [assignEmail, setAssignEmail] = useState("");
  const [caseIdsText, setCaseIdsText] = useState("");
  const [continuityFiles, setContinuityFiles] = useState<File[]>([]);
  const [findingsPasteText, setFindingsPasteText] = useState("");

  const fiveStarBonusPercent = bonusOverride ?? String(suggestedCaseBonusPercent(details.project, details.scopeOfWork, bonusDefaults.scopes, bonusDefaults.projects));

  const [timingPreviewStart, setTimingPreviewStart] = useState(() => Date.now());

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

  const findingsPreview = useMemo(() => {
    const parsed = parseRadiologistFindingsTable(findingsPasteText);
    return matchFindingsToCaseIds(parsed, batchCaseIds);
  }, [findingsPasteText, batchCaseIds]);
  const findingsJson = useMemo(
    () => findingsMapToJson(new Map(findingsPreview.matched.map((m) => [m.caseId, m.finding]))),
    [findingsPreview.matched],
  );

  function patchDetails(patch: Partial<CaseDetailsFieldsValue>) {
    if ((patch.project !== undefined && patch.project !== details.project) ||
        (patch.scopeOfWork !== undefined && patch.scopeOfWork !== details.scopeOfWork)) {
      setBonusOverride(null);
    }
    if (
      typeof patch.radiologistFinding === "string" &&
      looksLikeRadiologistFindingsTable(patch.radiologistFinding)
    ) {
      setFindingsPasteText(patch.radiologistFinding);
      setDetails((prev) => ({ ...prev, ...patch, radiologistFinding: "" }));
      return;
    }
    setDetails((prev) => ({ ...prev, ...patch }));
  }

  const [state, formAction, pending] = useActionState(
    async (_: CreateCaseActionResult | null, fd: FormData): Promise<CreateCaseActionResult> => {
      setClientError(null);
      fd.delete("continuityReports");
      for (const file of continuityFiles) fd.append("continuityReports", file);
      const size = [...fd.values()].reduce((total, value) => total + (value instanceof File ? value.size : new Blob([value]).size), 0);
      if (size > 15 * 1024 * 1024) return { ok: false, error: "upload_size" };
      try {
        return await createCaseAction(fd);
      } catch {
        return { ok: false, error: "network" };
      }
    },
    null as CreateCaseActionResult | null,
  );

  useEffect(() => {
    if (state?.ok) router.refresh();
    else if (state) errorRef.current?.focus();
  }, [state, router]);

  const baseRateHint =
    defaultPerMinuteRate != null
      ? tk("case_base_rate_hint_with_default").replace(
          "{rate}",
          formatCompensationAmount(lang, defaultPerMinuteRate),
        )
      : tk("case_base_rate_hint");

  return (
    <form
      id="create-case-form"
      action={formAction}
      encType="multipart/form-data"
      aria-busy={pending}
      onInvalidCapture={(event) => {
        const input = event.target as HTMLInputElement;
        const label = input.labels?.[0]?.textContent?.trim() || input.name;
        setClientError(`${label}: ${input.validationMessage}`);
      }}
      className="grid gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 md:grid-cols-2"
    >
      {(clientError || (state && !state.ok)) && (
        <div ref={errorRef} tabIndex={-1} role="alert" className="md:col-span-2 rounded-md border border-[var(--danger)] bg-[var(--bg)] p-4 text-sm focus:outline-2 focus:outline-[var(--danger)]">
          <p className="font-semibold text-[var(--danger)]">{lang === "vi" ? "Chưa thể tạo ca" : "We couldn’t create your cases"}</p>
          <p className="mt-1">{clientError || (state && !state.ok ? createCaseErrorMessage(state.error, lang) : "")}</p>
          {state && !state.ok && state.referenceId && <p className="mt-2 text-xs text-[var(--muted)]">{lang === "vi" ? "Mã tham chiếu" : "Reference"}: <code>{state.referenceId}</code></p>}
        </div>
      )}
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
          {...({ webkitdirectory: "", directory: "" } as InputHTMLAttributes<HTMLInputElement>)}
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

      <div className="md:col-span-2">
        <label htmlFor="create-case-rad-findings" className="text-sm text-[var(--muted)]">
          {tk("case_radiologist_findings_paste")}
        </label>
        <p className="mt-0.5 text-xs text-[var(--muted)]">{tk("case_radiologist_findings_paste_hint")}</p>
        <textarea
          id="create-case-rad-findings"
          rows={6}
          value={findingsPasteText}
          onChange={(e) => setFindingsPasteText(e.target.value)}
          placeholder={"study_id\tfinal_impressions\nasi-708cbd32-…\tThere is an indeterminate…"}
          className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 font-mono text-sm"
        />
        <input type="hidden" name="radiologistFindingsByCaseId" value={findingsJson} />
        {(findingsPreview.matched.length > 0 ||
          findingsPreview.unmatchedStudyIds.length > 0 ||
          (batchCaseIds.length > 0 && findingsPasteText.trim() !== "")) && (
          <div className="mt-2 space-y-2 rounded-md border border-[var(--border)] bg-[var(--bg)] p-3 text-xs">
            {findingsPreview.matched.length > 0 && (
              <div>
                <p className="font-medium text-[var(--text)]">
                  {tk("case_radiologist_findings_preview_matched")} ({findingsPreview.matched.length})
                </p>
                <ul className="mt-1 list-disc pl-4 text-[var(--muted)]">
                  {findingsPreview.matched.slice(0, 12).map((row) => (
                    <li key={row.caseId}>
                      <span className="font-mono text-[var(--text)]">{row.caseId}</span>
                      <span className="text-[var(--muted)]">
                        {" "}
                        ← {row.finding.length > 80 ? `${row.finding.slice(0, 80)}…` : row.finding}
                      </span>
                    </li>
                  ))}
                  {findingsPreview.matched.length > 12 ? (
                    <li>+{findingsPreview.matched.length - 12} more</li>
                  ) : null}
                </ul>
              </div>
            )}
            {findingsPreview.unmatchedStudyIds.length > 0 && (
              <div>
                <p className="font-medium text-[var(--warn)]">
                  {tk("case_radiologist_findings_preview_unmatched_ids")}
                </p>
                <p className="mt-1 text-[var(--muted)]">
                  {formatIdList(findingsPreview.unmatchedStudyIds, 8)}
                </p>
              </div>
            )}
            {findingsPasteText.trim() !== "" && findingsPreview.unmatchedCaseIds.length > 0 && (
              <div>
                <p className="font-medium text-[var(--muted)]">
                  {tk("case_radiologist_findings_preview_missing_cases")}
                </p>
                <p className="mt-1 text-[var(--muted)]">
                  {formatIdList(findingsPreview.unmatchedCaseIds, 8)}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      <CaseDetailsFields
        lang={lang}
        idPrefix="create-case"
        value={details}
        onChange={patchDetails}
        guides={guides}
        topics={topics}
        scopeOptions={scopeOptions}
        projectOptions={projectOptions}
        rbProjectOptions={rbProjectOptions}
        required
        formNames
        showBaseRatePlaceholder
        baseRateHint={baseRateHint}
      />

      <CaseQualityBonusField
        lang={lang} idPrefix="create-case" value={fiveStarBonusPercent} onChange={setBonusOverride}
        hint={lang === "vi" ? "Gợi ý từ ca mới nhất cùng dự án và phạm vi; nếu chưa có thì dùng mặc định dự án hoặc 15%. Có thể sửa trước khi tạo. Tỷ lệ này được lưu riêng cho mọi ca mới trong lô, tính trên thù lao tối thiểu (gồm khẩn cấp, không gồm thêm giờ). 0% để tắt thưởng. Đổi dự án hoặc phạm vi sẽ tải lại tỷ lệ gợi ý." : "Suggested from the latest case with the same project and scope; otherwise the project default or 15%. Edit before creating. This percentage is saved separately on every new case in this batch and applies to minimum case pay (including urgency, excluding extra time). Use 0% to disable the bonus. Changing project or scope reloads the suggestion."}
      />

      <CaseTimingFields
        lang={lang} deadlineHours={deadlineHours} expiryGraceHours={expiryGraceHours}
        setDeadlineHours={value => { setDeadlineHours(value); setTimingPreviewStart(Date.now()); }} setExpiryGraceHours={value => { setExpiryGraceHours(value); setTimingPreviewStart(Date.now()); }}
        baseRate={details.compensationAmount} previewStart={timingPreviewStart}
      />
      <label className="md:col-span-2">
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
      {state?.ok && (
        <div className="md:col-span-2 space-y-2 rounded-md border border-[var(--border)] bg-[var(--bg)] p-3 text-sm">
          {state.created === 0 && state.skippedExisting.length > 0 && <p role="status" className="font-medium text-[var(--warn)]">{lang === "vi" ? "Không có ca mới: tất cả mã đã tồn tại trong dự án Redbrick và phạm vi này. Kiểm tra danh sách ca hoặc nhập mã mới." : "No new cases were created: all IDs already exist in this Redbrick project and scope. Check the case list or enter new IDs."}</p>}
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
              <span className="text-[var(--warn)]">
                {formatIdList(state.continuityReportsUnmatched, 8)}
              </span>
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
          {pending ? (lang === "vi" ? "Đang tạo ca…" : "Creating cases…") : tk("create_submit")}
        </button>
      </div>
    </form>
  );
}
