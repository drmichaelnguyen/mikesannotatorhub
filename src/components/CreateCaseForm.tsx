"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { createCaseAction, type CreateCaseActionResult } from "@/app/actions/cases";
import type { GuideOption, TopicOption } from "@/lib/guide-topic";
import type { DictKey, Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";

function formatIdList(ids: string[], max = 40) {
  if (ids.length === 0) return "";
  const shown = ids.slice(0, max);
  const extra = ids.length > max ? ` (+${ids.length - max})` : "";
  return `${shown.join(", ")}${extra}`;
}

function htmlToPlainText(html: string) {
  if (!html) return "";
  if (typeof window === "undefined") return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  return (doc.body.textContent ?? "").replace(/\s+\n/g, "\n").trim();
}

type Annotator = { id: string; name: string; email: string };

type GuideSelectOption = GuideOption;

export function CreateCaseForm({
  lang,
  annotators = [],
  guides = [],
  topics = [],
}: {
  lang: Lang;
  annotators?: Annotator[];
  guides?: GuideSelectOption[];
  topics?: TopicOption[];
}) {
  const tk = (k: DictKey) => t(lang, k);
  const router = useRouter();
  const [redbrickProject, setRedbrickProject] = useState("");
  const [guideId, setGuideId] = useState("");
  const [topicId, setTopicId] = useState("");
  const [guideline, setGuideline] = useState("");
  const [scopeOfWork, setScopeOfWork] = useState("");
  const [minMinutesPerCase, setMinMinutesPerCase] = useState("");
  const [maxMinutesPerCase, setMaxMinutesPerCase] = useState("");
  const [compensationType, setCompensationType] = useState<"PER_CASE" | "PER_MINUTE">("PER_CASE");
  const [compensationAmount, setCompensationAmount] = useState("");
  const [assignEmail, setAssignEmail] = useState("");
  const lastGuideId = useRef("");

  const visibleGuides = guides;
  const visibleTopics = useMemo(
    () =>
      topics.filter(
        (topic) =>
          !redbrickProject.trim() ||
          topic.projects.length === 0 ||
          topic.projects.some((p) => p.redbrickProject === redbrickProject.trim()),
      ),
    [topics, redbrickProject],
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

  useEffect(() => {
    if (guideId === lastGuideId.current) return;
    lastGuideId.current = guideId;
    const selected = visibleGuides.find((guide) => guide.id === guideId);
    setGuideline(selected ? htmlToPlainText(selected.content) : "");
  }, [guideId, visibleGuides]);

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
      <label>
        <span className="text-sm text-[var(--muted)]">{tk("case_topic")}</span>
        <select
          name="topicId"
          value={topicId}
          onChange={(e) => setTopicId(e.target.value)}
          className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
        >
          <option value="">—</option>
          {visibleTopics.map((topic) => (
            <option key={topic.id} value={topic.id}>
              {topic.name}
            </option>
          ))}
        </select>
      </label>
      <label className="md:col-span-2">
        <span className="text-sm text-[var(--muted)]">{tk("case_guideline")}</span>
        <textarea
          name="guideline"
          required
          rows={3}
          value={guideline}
          onChange={(e) => setGuideline(e.target.value)}
          className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
        />
      </label>
      <label className="md:col-span-2">
        <span className="text-sm text-[var(--muted)]">{tk("case_scope")}</span>
        <textarea
          name="scopeOfWork"
          required
          rows={3}
          value={scopeOfWork}
          onChange={(e) => setScopeOfWork(e.target.value)}
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
