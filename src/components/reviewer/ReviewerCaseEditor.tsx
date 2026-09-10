"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CaseDetailsFields,
  type CaseDetailsFieldsValue,
} from "@/components/CaseDetailsFields";
import type { GuideOptionLite, TopicOptionLite } from "@/lib/guide-topic";
import type { DictKey, Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import { parseVideoGuideUrlsInput } from "@/lib/video-guides";
import { toDatetimeLocalValue } from "@/lib/format";
import { CaseStatus, CompensationType } from "@prisma/client";

function sameStringArray(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

function detailsFromCase(c: {
  project: string;
  redbrickProject: string;
  guide?: { id: string } | null;
  topics: { id: string }[];
  guideline: string;
  radiologistFinding: string;
  videoGuideUrls: string[];
  scopeOfWork: string;
  minMinutesPerCase: number;
  maxMinutesPerCase: number;
  compensationType: CompensationType;
  compensationAmount: number;
}): CaseDetailsFieldsValue {
  return {
    project: c.project,
    redbrickProject: c.redbrickProject,
    guideId: c.guide?.id ?? "",
    topicIds: c.topics.map((topic) => topic.id),
    guideline: c.guideline,
    radiologistFinding: c.radiologistFinding,
    videoGuideUrls: c.videoGuideUrls.join("\n"),
    scopeOfWork: c.scopeOfWork,
    minMinutesPerCase: String(c.minMinutesPerCase),
    maxMinutesPerCase: String(c.maxMinutesPerCase),
    compensationType: c.compensationType,
    compensationAmount: String(c.compensationAmount),
  };
}

export function ReviewerCaseEditor({
  lang,
  c,
  guides = [],
  topics = [],
  scopeOptions = [],
  projectOptions = [],
  rbProjectOptions = [],
}: {
  lang: Lang;
  c: {
    id: string;
    caseId: string;
    status: CaseStatus;
    project: string;
    redbrickProject: string;
    guide?: { id: string } | null;
    topics: { id: string }[];
    guideline: string;
    radiologistFinding: string;
    videoGuideUrls: string[];
    scopeOfWork: string;
    minMinutesPerCase: number;
    maxMinutesPerCase: number;
    compensationType: CompensationType;
    compensationAmount: number;
    annotatorBonus: number;
    isReference: boolean;
    deadline: string | null;
    expiresAt: string | null;
  };
  guides?: GuideOptionLite[];
  topics?: TopicOptionLite[];
  scopeOptions?: string[];
  projectOptions?: string[];
  rbProjectOptions?: string[];
}) {
  const tk = (k: DictKey) => t(lang, k);
  const router = useRouter();
  const [caseId, setCaseId] = useState(c.caseId);
  const [status, setStatus] = useState<CaseStatus>(c.status);
  const [details, setDetails] = useState<CaseDetailsFieldsValue>(() => detailsFromCase(c));
  const [bonusAmount, setBonusAmount] = useState(String(c.annotatorBonus));
  const [deadline, setDeadline] = useState(() => toDatetimeLocalValue(c.deadline));
  const [expiresAt, setExpiresAt] = useState(() => toDatetimeLocalValue(c.expiresAt));
  const [isReference, setIsReference] = useState(c.isReference);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    setCaseId(c.caseId);
    setStatus(c.status);
    setDetails(detailsFromCase(c));
    setBonusAmount(String(c.annotatorBonus));
    setDeadline(toDatetimeLocalValue(c.deadline));
    setExpiresAt(toDatetimeLocalValue(c.expiresAt));
    setIsReference(c.isReference);
    setMsg(null);
    setErr(null);
  }, [c]);

  function save() {
    setErr(null);
    setMsg(null);
    const minMinutesPerCase = Number(details.minMinutesPerCase);
    const maxMinutesPerCase = Number(details.maxMinutesPerCase);
    const compensationAmount = Number(details.compensationAmount);
    const annotatorBonus = Number(bonusAmount);

    if (
      !Number.isFinite(minMinutesPerCase) ||
      !Number.isFinite(maxMinutesPerCase) ||
      !Number.isFinite(compensationAmount) ||
      !Number.isFinite(annotatorBonus)
    ) {
      setErr(tk("required"));
      return;
    }

    start(async () => {
      const parsedVideoGuideUrls = parseVideoGuideUrlsInput(details.videoGuideUrls);
      const deadlineIso = deadline.trim()
        ? (() => {
            const d = new Date(deadline);
            return Number.isNaN(d.getTime()) ? null : d.toISOString();
          })()
        : null;
      if (deadline.trim() && deadlineIso == null) {
        setErr(tk("required"));
        return;
      }
      const expiresAtIso = expiresAt.trim()
        ? (() => {
            const d = new Date(expiresAt);
            return Number.isNaN(d.getTime()) ? null : d.toISOString();
          })()
        : null;
      if (
        (expiresAt.trim() && expiresAtIso == null) ||
        (deadlineIso && expiresAtIso && expiresAtIso <= deadlineIso)
      ) {
        setErr(tk("case_expiry_required"));
        return;
      }
      const detailsChanged =
        caseId !== c.caseId ||
        status !== c.status ||
        details.project !== c.project ||
        details.redbrickProject !== c.redbrickProject ||
        details.guideId !== (c.guide?.id ?? "") ||
        !sameStringArray(
          details.topicIds,
          c.topics.map((topic) => topic.id),
        ) ||
        details.guideline !== c.guideline ||
        details.radiologistFinding !== c.radiologistFinding ||
        !sameStringArray(parsedVideoGuideUrls, c.videoGuideUrls) ||
        details.scopeOfWork !== c.scopeOfWork ||
        minMinutesPerCase !== c.minMinutesPerCase ||
        maxMinutesPerCase !== c.maxMinutesPerCase ||
        details.compensationType !== c.compensationType ||
        compensationAmount !== c.compensationAmount ||
        annotatorBonus !== c.annotatorBonus ||
        deadlineIso !== c.deadline ||
        expiresAtIso !== c.expiresAt;
      const requestBody = detailsChanged
        ? {
            caseId,
            status,
            project: details.project,
            redbrickProject: details.redbrickProject,
            guideId: details.guideId,
            topicIds: details.topicIds,
            guideline: details.guideline,
            radiologistFinding: details.radiologistFinding,
            videoGuideUrls: parsedVideoGuideUrls,
            scopeOfWork: details.scopeOfWork,
            minMinutesPerCase,
            maxMinutesPerCase,
            compensationType: details.compensationType,
            compensationAmount,
            annotatorBonus,
            deadline: deadlineIso,
            expiresAt: expiresAtIso,
            isReference,
          }
        : { isReference };
      const response = await fetch(`/api/reviewer/cases/${encodeURIComponent(c.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      const res = (await response.json().catch(() => null)) as
        | { ok: true }
        | { ok: false; error?: string }
        | null;
      if (!res?.ok) {
        const error = res?.error;
        if (error === "case_exists") setErr(tk("case_exists"));
        else if (error === "limits") setErr(tk("case_limits_invalid"));
        else if (error === "scope_words") setErr(tk("scope_word_limit"));
        else setErr(tk("required"));
        return;
      }
      setMsg(tk("reviewer_case_saved"));
      router.refresh();
    });
  }

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      <h4 className="mb-1 text-sm font-medium">{tk("reviewer_case_edit")}</h4>
      <p className="mb-3 text-xs text-[var(--muted)]">{tk("reviewer_case_edit_help")}</p>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="md:col-span-2">
          <span className="text-sm text-[var(--muted)]">{tk("case_caseId")}</span>
          <input
            value={caseId}
            onChange={(e) => setCaseId(e.target.value)}
            className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 font-mono"
          />
        </label>
        <label className="md:col-span-2">
          <span className="text-sm text-[var(--muted)]">{tk("case_status")}</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as CaseStatus)}
            className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
          >
            <option value={CaseStatus.AVAILABLE}>{tk("status_AVAILABLE")}</option>
            <option value={CaseStatus.ASSIGNED}>{tk("status_ASSIGNED")}</option>
            <option value={CaseStatus.SUBMITTED}>{tk("status_SUBMITTED")}</option>
            <option value={CaseStatus.ACCEPTED}>{tk("status_ACCEPTED")}</option>
            <option value={CaseStatus.AUDITED}>{tk("status_AUDITED")}</option>
            <option value={CaseStatus.REJECTED}>{tk("status_REJECTED")}</option>
            <option value={CaseStatus.EXPIRED}>{tk("status_EXPIRED")}</option>
            <option value={CaseStatus.ADMIN_COMPLETED}>{tk("status_ADMIN_COMPLETED")}</option>
          </select>
        </label>

        <CaseDetailsFields
          lang={lang}
          idPrefix="edit-case"
          value={details}
          onChange={(patch) => setDetails((prev) => ({ ...prev, ...patch }))}
          guides={guides}
          topics={topics}
          scopeOptions={scopeOptions}
          projectOptions={projectOptions}
          rbProjectOptions={rbProjectOptions}
          baseRateHint={tk("case_base_rate_hint")}
        />

        <label>
          <span className="text-sm text-[var(--muted)]">{tk("case_annotatorBonus")}</span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={bonusAmount}
            onChange={(e) => setBonusAmount(e.target.value)}
            className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 tabular-nums"
          />
        </label>
        <label className="md:col-span-2">
          <span className="text-sm text-[var(--muted)]">{tk("case_deadline")}</span>
          <input
            type="datetime-local"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
          />
          <p className="mt-1 text-xs text-[var(--muted)]">{tk("case_deadline_hint")}</p>
        </label>
        <label className="md:col-span-2">
          <span className="text-sm text-[var(--muted)]">{tk("case_expiry")}</span>
          <input
            type="datetime-local"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
          />
          <p className="mt-1 text-xs text-[var(--muted)]">{tk("case_expiry_hint")}</p>
        </label>
        <label className="md:col-span-2 flex items-start gap-2 rounded-md border border-[var(--border)] bg-[var(--bg)] p-3 text-sm">
          <input
            type="checkbox"
            checked={isReference}
            onChange={(e) => setIsReference(e.target.checked)}
            className="mt-1"
          />
          <span>
            <span className="block font-medium">{tk("case_reference")}</span>
            <span className="block text-xs text-[var(--muted)]">{tk("case_reference_help")}</span>
          </span>
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={save}
          className="rounded-md bg-[var(--accent)] px-4 py-2 text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
        >
          {tk("reviewer_case_save")}
        </button>
        {err && <p className="text-sm text-[var(--danger)]">{err}</p>}
        {msg && !err && <p className="text-sm text-[var(--success)]">{msg}</p>}
      </div>
    </div>
  );
}
