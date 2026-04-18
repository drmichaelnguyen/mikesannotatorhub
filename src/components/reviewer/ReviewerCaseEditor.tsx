"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateCaseDetailsAction } from "@/app/actions/cases";
import type { DictKey, Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import { CompensationType } from "@prisma/client";

export function ReviewerCaseEditor({
  lang,
  c,
}: {
  lang: Lang;
  c: {
    id: string;
    caseId: string;
    redbrickProject: string;
    guideline: string;
    scopeOfWork: string;
    minMinutesPerCase: number;
    maxMinutesPerCase: number;
    compensationType: CompensationType;
    compensationAmount: number;
  };
}) {
  const tk = (k: DictKey) => t(lang, k);
  const router = useRouter();
  const [caseId, setCaseId] = useState(c.caseId);
  const [redbrickProject, setRedbrickProject] = useState(c.redbrickProject);
  const [guideline, setGuideline] = useState(c.guideline);
  const [scopeOfWork, setScopeOfWork] = useState(c.scopeOfWork);
  const [minMinutes, setMinMinutes] = useState(String(c.minMinutesPerCase));
  const [maxMinutes, setMaxMinutes] = useState(String(c.maxMinutesPerCase));
  const [compType, setCompType] = useState<CompensationType>(c.compensationType);
  const [compAmount, setCompAmount] = useState(String(c.compensationAmount));
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    setCaseId(c.caseId);
    setRedbrickProject(c.redbrickProject);
    setGuideline(c.guideline);
    setScopeOfWork(c.scopeOfWork);
    setMinMinutes(String(c.minMinutesPerCase));
    setMaxMinutes(String(c.maxMinutesPerCase));
    setCompType(c.compensationType);
    setCompAmount(String(c.compensationAmount));
    setMsg(null);
    setErr(null);
  }, [c]);

  function save() {
    setErr(null);
    setMsg(null);
    const minMinutesPerCase = Number(minMinutes);
    const maxMinutesPerCase = Number(maxMinutes);
    const compensationAmount = Number(compAmount);

    if (
      !Number.isFinite(minMinutesPerCase) ||
      !Number.isFinite(maxMinutesPerCase) ||
      !Number.isFinite(compensationAmount)
    ) {
      setErr(tk("required"));
      return;
    }

    start(async () => {
      const res = await updateCaseDetailsAction({
        caseDbId: c.id,
        caseId,
        redbrickProject,
        guideline,
        scopeOfWork,
        minMinutesPerCase,
        maxMinutesPerCase,
        compensationType: compType,
        compensationAmount,
      });
      if (!res.ok) {
        if (res.error === "case_exists") setErr(tk("case_exists"));
        else if (res.error === "limits") setErr(tk("case_limits_invalid"));
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
        <label className="md:col-span-2 text-sm">
          <span className="text-[var(--muted)]">{tk("case_redbrick")}</span>
          <input
            value={redbrickProject}
            onChange={(e) => setRedbrickProject(e.target.value)}
            className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
          />
        </label>
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
          <span className="text-[var(--muted)]">{tk("case_scope")}</span>
          <textarea
            value={scopeOfWork}
            onChange={(e) => setScopeOfWork(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
          />
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
