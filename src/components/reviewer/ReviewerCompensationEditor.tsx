"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { updateCaseCompensationAction } from "@/app/actions/cases";
import type { DictKey, Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import { CompensationType } from "@prisma/client";

export function ReviewerCompensationEditor({
  lang,
  caseDbId,
  initialType,
  initialAmount,
}: {
  lang: Lang;
  caseDbId: string;
  initialType: CompensationType;
  initialAmount: number;
}) {
  const tk = (k: DictKey) => t(lang, k);
  const router = useRouter();
  const [compType, setCompType] = useState<CompensationType>(initialType);
  const [amountStr, setAmountStr] = useState(String(initialAmount));
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    setCompType(initialType);
    setAmountStr(String(initialAmount));
    setMsg(null);
    setErr(null);
  }, [caseDbId, initialType, initialAmount]);

  function save() {
    setErr(null);
    setMsg(null);
    const compensationAmount = Number(amountStr);
    if (!Number.isFinite(compensationAmount) || compensationAmount < 0) {
      setErr(tk("required"));
      return;
    }
    start(async () => {
      const res = await updateCaseCompensationAction({
        caseDbId,
        compensationType: compType,
        compensationAmount,
      });
      if (!res.ok) {
        setErr(tk("required"));
        return;
      }
      setMsg(tk("reviewer_compensation_saved"));
      router.refresh();
    });
  }

  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-3">
      <h4 className="mb-1 text-sm font-medium">{tk("reviewer_compensation_edit")}</h4>
      <p className="mb-3 text-xs text-[var(--muted)]">{tk("reviewer_compensation_help")}</p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-[160px] text-sm">
          <span className="text-[var(--muted)]">{tk("case_compType")}</span>
          <select
            value={compType}
            onChange={(e) => setCompType(e.target.value as CompensationType)}
            className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5"
          >
            <option value={CompensationType.PER_CASE}>{tk("comp_per_case")}</option>
            <option value={CompensationType.PER_MINUTE}>{tk("comp_per_minute")}</option>
          </select>
        </label>
        <label className="min-w-[140px] flex-1 text-sm">
          <span className="text-[var(--muted)]">{tk("case_compAmount")}</span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
            className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 tabular-nums"
          />
        </label>
        <button
          type="button"
          disabled={pending}
          onClick={save}
          className="rounded-md bg-[var(--accent)] px-3 py-2 text-sm text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
        >
          {tk("reviewer_compensation_save")}
        </button>
      </div>
      {err && <p className="mt-2 text-sm text-[var(--danger)]">{err}</p>}
      {msg && !err && <p className="mt-2 text-sm text-[var(--success)]">{msg}</p>}
    </div>
  );
}
