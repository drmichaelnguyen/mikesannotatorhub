"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import type { CompensationType } from "@prisma/client";
import {
  buildCaseCompensationBreakdown,
  type CaseCompensationBreakdown,
} from "@/lib/compensation";
import { formatCompensationAmount } from "@/lib/format";
import type { DictKey, Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";

export type CaseCompensationInputs = {
  compensationType: CompensationType;
  compensationAmount: number;
  annotationMinutes: number | null;
  minMinutesPerCase: number;
  maxMinutesPerCase: number;
  annotatorBonus: number;
  wasResubmitted?: boolean;
};

function formatSignedAmount(lang: Lang, value: number) {
  const abs = formatCompensationAmount(lang, Math.abs(value));
  if (value > 0) return `+${abs}`;
  if (value < 0) return `−${abs}`;
  return abs;
}

function BreakdownRows({
  lang,
  breakdown,
  wasResubmitted = false,
}: {
  lang: Lang;
  breakdown: CaseCompensationBreakdown;
  wasResubmitted?: boolean;
}) {
  const tk = (k: DictKey) => t(lang, k);
  const fmt = (n: number) => formatCompensationAmount(lang, n);
  const rateLabel =
    breakdown.type === "PER_MINUTE"
      ? `${fmt(breakdown.rateOrAmount)} × ${tk("comp_per_minute")}`
      : `${fmt(breakdown.rateOrAmount)} (${tk("comp_per_case")})`;

  return (
    <dl className="space-y-2 text-sm">
      <div className="flex justify-between gap-4">
        <dt className="text-[var(--muted)]">{tk("case_compType")}</dt>
        <dd className="text-right text-[var(--text)]">
          {breakdown.type === "PER_MINUTE" ? tk("comp_per_minute") : tk("comp_per_case")}
        </dd>
      </div>
      <div className="flex justify-between gap-4">
        <dt className="text-[var(--muted)]">{tk("case_compAmount")}</dt>
        <dd className="text-right tabular-nums text-[var(--text)]">{rateLabel}</dd>
      </div>

      {breakdown.type === "PER_MINUTE" && (
        <>
          <div className="flex justify-between gap-4">
            <dt className="text-[var(--muted)]">{tk("pay_calc_recommended_range")}</dt>
            <dd className="text-right tabular-nums text-[var(--text)]">
              {breakdown.minMinutes}–{breakdown.maxMinutes} {tk("pay_calc_minutes_unit")}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-[var(--muted)]">{tk("case_optimal_minutes")}</dt>
            <dd className="text-right tabular-nums text-[var(--text)]">
              {breakdown.optimalMinutes} {tk("pay_calc_minutes_unit")}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-[var(--muted)]">{tk("case_minimum_pay")}</dt>
            <dd className="text-right tabular-nums text-[var(--text)]">
              {breakdown.optimalMinutes} × {fmt(breakdown.rateOrAmount)} = {fmt(breakdown.minimumCasePay)}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-[var(--muted)]">{tk("case_annotationMinutes")}</dt>
            <dd className="text-right tabular-nums text-[var(--text)]">
              {breakdown.annotationMinutes == null
                ? "—"
                : `${breakdown.annotationMinutes} ${tk("pay_calc_minutes_unit")}`}
            </dd>
          </div>
          {breakdown.cappedAtMax && (
            <p className="rounded-md bg-[var(--bg)] px-2 py-1.5 text-xs text-[var(--muted)]">
              {tk("pay_calc_capped_at_max")} ({breakdown.maxMinutes} {tk("pay_calc_minutes_unit")})
            </p>
          )}
          {breakdown.annotationMinutes == null ? (
            <p className="rounded-md bg-[var(--bg)] px-2 py-1.5 text-xs text-[var(--muted)]">
              {tk("pay_calc_no_time_yet")}
            </p>
          ) : breakdown.atOrUnderOptimal ? (
            <p className="rounded-md bg-[var(--bg)] px-2 py-1.5 text-xs text-[var(--muted)]">
              {tk("pay_calc_at_or_under_optimal")}
            </p>
          ) : (
            <>
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--muted)]">{tk("pay_calc_overtime_minutes")}</dt>
                <dd className="text-right tabular-nums text-[var(--text)]">
                  {breakdown.overtimeMinutes} {tk("pay_calc_minutes_unit")}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--muted)]">{tk("pay_calc_overtime_pay")}</dt>
                <dd className="text-right tabular-nums text-[var(--text)]">
                  {fmt(breakdown.overtimePay)}
                </dd>
              </div>
              <p className="rounded-md bg-[var(--bg)] px-2 py-1.5 text-xs text-[var(--muted)]">
                {tk("pay_calc_overtime_note")}
              </p>
            </>
          )}
        </>
      )}

      {breakdown.type === "PER_CASE" && (
        <p className="rounded-md bg-[var(--bg)] px-2 py-1.5 text-xs text-[var(--muted)]">
          {tk("pay_calc_flat_case")}
        </p>
      )}

      {wasResubmitted && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-xs text-[var(--text)]">
          {tk("pay_calc_resubmit_note")}
        </p>
      )}

      <div className="border-t border-[var(--border)] pt-2">
        <div className="flex justify-between gap-4">
          <dt className="text-[var(--muted)]">{tk("dash_base_compensation")}</dt>
          <dd className="text-right tabular-nums font-medium text-[var(--text)]">
            {fmt(breakdown.baseCompensation)}
          </dd>
        </div>
        <div className="mt-2 flex justify-between gap-4">
          <dt className="text-[var(--muted)]">{tk("dash_bonus_compensation")}</dt>
          <dd className="text-right tabular-nums text-[var(--text)]">
            {formatSignedAmount(lang, breakdown.qualityAdjustment)}
          </dd>
        </div>
        <div className="mt-2 flex justify-between gap-4 border-t border-[var(--border)] pt-2">
          <dt className="font-medium text-[var(--text)]">{tk("dash_project_total")}</dt>
          <dd className="text-right tabular-nums text-base font-semibold text-[var(--success)]">
            {fmt(breakdown.totalCompensation)}
          </dd>
        </div>
        <p className="mt-1 text-right text-xs text-[var(--muted)]">
          {fmt(breakdown.baseCompensation)}{" "}
          {breakdown.qualityAdjustment >= 0 ? "+" : "−"}{" "}
          {fmt(Math.abs(breakdown.qualityAdjustment))} = {fmt(breakdown.totalCompensation)}
        </p>
      </div>
    </dl>
  );
}

export function CaseCompensationBreakdownModal({
  lang,
  title,
  inputs,
  onClose,
}: {
  lang: Lang;
  title?: string;
  inputs: CaseCompensationInputs;
  onClose: () => void;
}) {
  const tk = (k: DictKey) => t(lang, k);
  const titleId = useId();
  const breakdown = buildCaseCompensationBreakdown(
    inputs.compensationType,
    inputs.compensationAmount,
    inputs.annotationMinutes,
    inputs.maxMinutesPerCase,
    inputs.minMinutesPerCase,
    inputs.annotatorBonus,
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 shadow-xl"
        role="dialog"
        aria-modal
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-2 border-b border-[var(--border)] pb-3">
          <div>
            <h2 id={titleId} className="text-lg font-semibold text-[var(--text)]">
              {tk("pay_calc_title")}
            </h2>
            {title ? <p className="mt-0.5 text-sm text-[var(--muted)]">{title}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md border border-[var(--border)] px-2.5 py-1 text-xs hover:border-[var(--accent)]"
          >
            {tk("drawer_close")}
          </button>
        </div>
        <BreakdownRows
          lang={lang}
          breakdown={breakdown}
          wasResubmitted={inputs.wasResubmitted}
        />
      </div>
    </div>
  );
}

/** Clickable compensation amount that opens a calculation breakdown. */
export function CaseCompensationAmountButton({
  lang,
  amount,
  inputs,
  title,
  className = "",
  children,
}: {
  lang: Lang;
  amount: number;
  inputs: CaseCompensationInputs;
  title?: string;
  className?: string;
  children?: ReactNode;
}) {
  const tk = (k: DictKey) => t(lang, k);
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className={`tabular-nums text-[var(--accent)] underline-offset-2 hover:underline ${className}`}
        title={tk("pay_calc_click_hint")}
        aria-haspopup="dialog"
      >
        {children ?? formatCompensationAmount(lang, amount)}
      </button>
      {open && (
        <CaseCompensationBreakdownModal
          lang={lang}
          title={title}
          inputs={inputs}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
