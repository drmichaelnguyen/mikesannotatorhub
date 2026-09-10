"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { rerateCaseQualityAction } from "@/app/actions/cases";
import { StarRating } from "@/components/StarRating";
import { createCaseErrorMessage } from "@/lib/create-case-errors";
import {
  computeCaseBasePay,
  computeCompensation,
  suggestedQualityAdjustment,
} from "@/lib/compensation";
import { formatCompensationAmount } from "@/lib/format";
import type { DictKey, Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import type { CompensationType } from "@prisma/client";

export function RerateQualityPanel({
  lang,
  caseDbId,
  currentRating,
  compensationType,
  compensationAmount,
  annotationMinutes,
  minMinutesPerCase,
  maxMinutesPerCase,
  wasResubmitted = false,
  rushPercent = 0,
  fiveStarBonusPercent = 15,
}: {
  lang: Lang;
  caseDbId: string;
  currentRating: number | null;
  compensationType: CompensationType;
  compensationAmount: number;
  annotationMinutes: number | null;
  minMinutesPerCase: number;
  maxMinutesPerCase: number;
  wasResubmitted?: boolean;
  rushPercent?: number;
  fiveStarBonusPercent?: number;
}) {
  const tk = (k: DictKey) => t(lang, k);
  const router = useRouter();
  const [qualityRating, setQualityRating] = useState<number | null>(currentRating);
  const [bonusOverridden, setBonusOverridden] = useState(false);
  const [annotatorBonus, setAnnotatorBonus] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const caseBase = computeCaseBasePay(
    compensationType,
    compensationAmount,
    minMinutesPerCase,
    maxMinutesPerCase,
    rushPercent,
  );

  useEffect(() => {
    setQualityRating(currentRating);
    setBonusOverridden(false);
    setAnnotatorBonus("");
    setMsg(null);
    setErr(null);
  }, [caseDbId, currentRating]);

  useEffect(() => {
    if (bonusOverridden) return;
    if (qualityRating == null) {
      setAnnotatorBonus("");
      return;
    }
    setAnnotatorBonus(
      String(
        suggestedQualityAdjustment(qualityRating, caseBase, {
          wasResubmitted,
          fiveStarBonusPercent,
        }),
      ),
    );
  }, [qualityRating, caseBase, wasResubmitted, fiveStarBonusPercent, bonusOverridden]);

  function save() {
    if (!qualityRating) {
      setErr(tk("rating_required"));
      return;
    }
    const bonus = annotatorBonus.trim()
      ? Number(annotatorBonus)
      : suggestedQualityAdjustment(qualityRating, caseBase, {
          wasResubmitted,
          fiveStarBonusPercent,
        });
    if (!Number.isFinite(bonus)) {
      setErr(createCaseErrorMessage("bonus", lang));
      return;
    }
    setErr(null);
    setMsg(null);
    start(async () => {
      const res = await rerateCaseQualityAction({
        caseDbId,
        qualityRating,
        annotatorBonus: bonusOverridden ? bonus : undefined,
      });
      if (!res.ok) {
        setErr(
          res.error === "rating"
            ? tk("rating_required")
            : res.error === "bonus"
              ? createCaseErrorMessage("bonus", lang)
              : res.error === "state"
                ? tk("reviewer_rerate_not_audited")
                : tk("required"),
        );
        return;
      }
      setMsg(
        `${tk("reviewer_rerate_saved")} — ${tk("compensation_preview")}: ${formatCompensationAmount(lang, res.payout)}`,
      );
      router.refresh();
    });
  }

  const adjustmentPreview =
    qualityRating != null && annotatorBonus.trim() && Number.isFinite(Number(annotatorBonus))
      ? computeCompensation(
          compensationType,
          compensationAmount,
          annotationMinutes,
          maxMinutesPerCase,
          minMinutesPerCase,
          Number(annotatorBonus),
          rushPercent,
        )
      : null;

  return (
    <div className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4">
      <div>
        <h4 className="font-medium">{tk("reviewer_rerate_title")}</h4>
        <p className="mt-1 text-xs text-[var(--muted)]">{tk("reviewer_rerate_intro")}</p>
      </div>
      <StarRating
        label={tk("reviewer_quality_rating")}
        value={qualityRating}
        onChange={(rating) => {
          setQualityRating(rating);
          setBonusOverridden(false);
          setErr(null);
          setMsg(null);
        }}
        required
      />
      {qualityRating != null && (
        <label className="block">
          <span className="text-sm text-[var(--muted)]">{tk("case_quality_adjustment")}</span>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            {tk("review_quality_adjustment_hint")}{" "}
            {lang === "vi" ? "Thưởng 5★ của ca" : "Case 5★ bonus"}: {fiveStarBonusPercent}%.
          </p>
          <input
            type="number"
            step="0.01"
            value={annotatorBonus}
            onChange={(e) => {
              setAnnotatorBonus(e.target.value);
              setBonusOverridden(e.target.value.trim() !== "");
            }}
            className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
          />
          {adjustmentPreview != null && (
            <p className="mt-1 text-xs text-[var(--muted)]">
              {tk("compensation_preview")}: {formatCompensationAmount(lang, adjustmentPreview)}
            </p>
          )}
        </label>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={pending || qualityRating == null}
          onClick={save}
          className="rounded-md bg-[var(--accent)] px-4 py-2 text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
        >
          {tk("reviewer_rerate_save")}
        </button>
        {err && <p className="text-sm text-[var(--danger)]">{err}</p>}
        {msg && !err && <p className="text-sm text-[var(--success)]">{msg}</p>}
      </div>
    </div>
  );
}
