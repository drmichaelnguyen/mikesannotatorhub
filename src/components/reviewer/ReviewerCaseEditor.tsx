"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateCaseDetailsAction } from "@/app/actions/cases";
import type { GuideOption, TopicOption } from "@/lib/guide-topic";
import type { DictKey, Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import { parseVideoGuideUrlsInput } from "@/lib/video-guides";
import { CaseStatus, CompensationType } from "@prisma/client";

export function ReviewerCaseEditor({
  lang,
  c,
  guides = [],
  topics = [],
  scopeOptions = [],
}: {
  lang: Lang;
  c: {
    id: string;
    caseId: string;
    status: CaseStatus;
    redbrickProject: string;
    guide?: { id: string } | null;
    topics: { id: string }[];
    guideline: string;
    videoGuideUrls: string[];
    scopeOfWork: string;
    minMinutesPerCase: number;
    maxMinutesPerCase: number;
    compensationType: CompensationType;
    compensationAmount: number;
    annotatorBonus: number;
    isReference: boolean;
  };
  guides?: GuideOption[];
  topics?: TopicOption[];
  scopeOptions?: string[];
}) {
  const tk = (k: DictKey) => t(lang, k);
  const router = useRouter();
  const [caseId, setCaseId] = useState(c.caseId);
  const [status, setStatus] = useState<CaseStatus>(c.status);
  const [redbrickProject, setRedbrickProject] = useState(c.redbrickProject);
  const [guideId, setGuideId] = useState(c.guide?.id ?? "");
  const [topicIds, setTopicIds] = useState<string[]>(() => c.topics.map((t) => t.id));
  const [guideline, setGuideline] = useState(c.guideline);
  const [videoGuideUrlsText, setVideoGuideUrlsText] = useState(() => c.videoGuideUrls.join("\n"));
  const [scopeOfWork, setScopeOfWork] = useState(c.scopeOfWork);
  const [minMinutes, setMinMinutes] = useState(String(c.minMinutesPerCase));
  const [maxMinutes, setMaxMinutes] = useState(String(c.maxMinutesPerCase));
  const [compType, setCompType] = useState<CompensationType>(c.compensationType);
  const [compAmount, setCompAmount] = useState(String(c.compensationAmount));
  const [bonusAmount, setBonusAmount] = useState(String(c.annotatorBonus));
  const [isReference, setIsReference] = useState(c.isReference);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

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

  useEffect(() => {
    setCaseId(c.caseId);
    setStatus(c.status);
    setRedbrickProject(c.redbrickProject);
    setGuideId(c.guide?.id ?? "");
    setTopicIds(c.topics.map((t) => t.id));
    setGuideline(c.guideline);
    setVideoGuideUrlsText(c.videoGuideUrls.join("\n"));
    setScopeOfWork(c.scopeOfWork);
    setMinMinutes(String(c.minMinutesPerCase));
    setMaxMinutes(String(c.maxMinutesPerCase));
    setCompType(c.compensationType);
    setCompAmount(String(c.compensationAmount));
    setBonusAmount(String(c.annotatorBonus));
    setIsReference(c.isReference);
    setMsg(null);
    setErr(null);
  }, [c]);

  function save() {
    setErr(null);
    setMsg(null);
    const minMinutesPerCase = Number(minMinutes);
    const maxMinutesPerCase = Number(maxMinutes);
    const compensationAmount = Number(compAmount);
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
      const res = await updateCaseDetailsAction({
        caseDbId: c.id,
        caseId,
        status,
        redbrickProject,
        guideId,
        topicIds,
        guideline,
        videoGuideUrls: parseVideoGuideUrlsInput(videoGuideUrlsText),
        scopeOfWork,
        minMinutesPerCase,
        maxMinutesPerCase,
        compensationType: compType,
        compensationAmount,
        annotatorBonus,
        isReference,
      });
      if (!res.ok) {
        if (res.error === "case_exists") setErr(tk("case_exists"));
        else if (res.error === "limits") setErr(tk("case_limits_invalid"));
        else if (res.error === "scope_words") setErr(tk("scope_word_limit"));
        else setErr(tk("required"));
        return;
      }
      setMsg(tk("reviewer_case_saved"));
      router.refresh();
    });
  }

  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-3">
      <h4 className="mb-1 text-sm font-medium">{tk("reviewer_case_edit")}</h4>
      <p className="mb-3 text-xs text-[var(--muted)]">{tk("reviewer_case_edit_help")}</p>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="md:col-span-2 text-sm">
          <span className="text-[var(--muted)]">{tk("case_caseId")}</span>
          <input
            value={caseId}
            onChange={(e) => setCaseId(e.target.value)}
            className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono"
          />
        </label>
        <label className="text-sm">
          <span className="text-[var(--muted)]">{tk("case_status")}</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as CaseStatus)}
            className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
          >
            <option value={CaseStatus.AVAILABLE}>{tk("status_AVAILABLE")}</option>
            <option value={CaseStatus.ASSIGNED}>{tk("status_ASSIGNED")}</option>
            <option value={CaseStatus.SUBMITTED}>{tk("status_SUBMITTED")}</option>
            <option value={CaseStatus.ACCEPTED}>{tk("status_ACCEPTED")}</option>
            <option value={CaseStatus.AUDITED}>{tk("status_AUDITED")}</option>
            <option value={CaseStatus.REJECTED}>{tk("status_REJECTED")}</option>
          </select>
        </label>
        <label className="md:col-span-2 text-sm">
          <span className="text-[var(--muted)]">{tk("case_guide")}</span>
          <select
            value={guideId}
            onChange={(e) => setGuideId(e.target.value)}
            className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
          >
            <option value="">—</option>
            {guides.map((guide) => (
              <option key={guide.id} value={guide.id}>
                {guide.title}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-[var(--muted)]">{tk("reviewer_case_edit_help")}</p>
        </label>
        <label className="md:col-span-2 text-sm">
          <span className="text-[var(--muted)]">{tk("case_redbrick")}</span>
          <input
            value={redbrickProject}
            onChange={(e) => setRedbrickProject(e.target.value)}
            className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
          />
        </label>
        <div className="md:col-span-2 text-sm">
          <span className="text-[var(--muted)]">{tk("case_topic")}</span>
          <p className="mt-0.5 text-xs text-[var(--muted)]">{tk("case_topic_multi_hint")}</p>
          <div className="mt-2 max-h-40 space-y-2 overflow-y-auto rounded-md border border-[var(--border)] bg-[var(--surface)] p-2">
            {visibleTopics.length === 0 ? (
              <p className="text-xs text-[var(--muted)]">—</p>
            ) : (
              visibleTopics.map((topic) => (
                <label key={topic.id} className="flex cursor-pointer items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={topicIds.includes(topic.id)}
                    onChange={() =>
                      setTopicIds((prev) =>
                        prev.includes(topic.id)
                          ? prev.filter((id) => id !== topic.id)
                          : [...prev, topic.id],
                      )
                    }
                  />
                  <span>{topic.name}</span>
                </label>
              ))
            )}
          </div>
        </div>
        <label className="md:col-span-2 text-sm">
          <span className="text-[var(--muted)]">{tk("case_guideline")}</span>
          <textarea
            value={guideline}
            onChange={(e) => setGuideline(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
          />
        </label>
        <label className="md:col-span-2 text-sm">
          <span className="text-[var(--muted)]">{tk("case_videos")}</span>
          <textarea
            value={videoGuideUrlsText}
            onChange={(e) => setVideoGuideUrlsText(e.target.value)}
            rows={3}
            placeholder="https://..."
            className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-sm"
          />
          <p className="mt-1 text-xs text-[var(--muted)]">{tk("case_video_guides_hint")}</p>
        </label>
        <label className="md:col-span-2 text-sm">
          <span className="text-[var(--muted)]">{tk("case_scope")}</span>
          <input
            list="scope-options-edit"
            value={scopeOfWork}
            onChange={(e) => setScopeOfWork(e.target.value)}
            className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
          />
          <datalist id="scope-options-edit">
            {scopeOptions.map((scope) => (
              <option key={scope} value={scope} />
            ))}
          </datalist>
          <p className="mt-1 text-xs text-[var(--muted)]">{tk("case_scope_hint")}</p>
        </label>
        <label className="text-sm">
          <span className="text-[var(--muted)]">{tk("case_minMinutes_recommended")}</span>
          <input
            type="number"
            min={1}
            value={minMinutes}
            onChange={(e) => setMinMinutes(e.target.value)}
            className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
          />
        </label>
        <label className="text-sm">
          <span className="text-[var(--muted)]">{tk("case_maxMinutes")}</span>
          <input
            type="number"
            min={1}
            value={maxMinutes}
            onChange={(e) => setMaxMinutes(e.target.value)}
            className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
          />
        </label>
        <label className="text-sm">
          <span className="text-[var(--muted)]">{tk("case_compType")}</span>
          <select
            value={compType}
            onChange={(e) => setCompType(e.target.value as CompensationType)}
            className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
          >
            <option value={CompensationType.PER_CASE}>{tk("comp_per_case")}</option>
            <option value={CompensationType.PER_MINUTE}>{tk("comp_per_minute")}</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="text-[var(--muted)]">{tk("case_compAmount")}</span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={compAmount}
            onChange={(e) => setCompAmount(e.target.value)}
            className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 tabular-nums"
          />
        </label>
        <label className="text-sm">
          <span className="text-[var(--muted)]">{tk("case_annotatorBonus")}</span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={bonusAmount}
            onChange={(e) => setBonusAmount(e.target.value)}
            className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 tabular-nums"
          />
        </label>
        <label className="md:col-span-2 flex items-start gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] p-3 text-sm">
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
          className="rounded-md bg-[var(--accent)] px-3 py-2 text-sm text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
        >
          {tk("reviewer_case_save")}
        </button>
        {err && <p className="text-sm text-[var(--danger)]">{err}</p>}
        {msg && !err && <p className="text-sm text-[var(--success)]">{msg}</p>}
      </div>
    </div>
  );
}
