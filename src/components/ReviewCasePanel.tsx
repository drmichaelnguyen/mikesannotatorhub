"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { reviewCaseAction } from "@/app/actions/cases";
import { ScreenshotDrawer } from "@/components/ScreenshotDrawer";
import { StarRating } from "@/components/StarRating";
import { getClipboardImageFile, readFileAsDataUrl } from "@/lib/client-image-data";
import {
  computeCaseBasePay,
  computeCompensation,
  suggestedQualityAdjustment,
} from "@/lib/compensation";
import { formatCompensationAmount } from "@/lib/format";
import type { DictKey, Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import type { CompensationType } from "@prisma/client";

export function ReviewCasePanel({
  lang,
  caseDbId,
  compensationType,
  compensationAmount,
  annotationMinutes,
  minMinutesPerCase,
  maxMinutesPerCase,
  wasResubmitted = false,
}: {
  lang: Lang;
  caseDbId: string;
  compensationType: CompensationType;
  compensationAmount: number;
  annotationMinutes: number | null;
  minMinutesPerCase: number;
  maxMinutesPerCase: number;
  /** Prior REJECT review exists (case was rejected then resubmitted). */
  wasResubmitted?: boolean;
}) {
  const tk = (k: DictKey) => t(lang, k);
  const [comment, setComment] = useState("");
  const [rawImage, setRawImage] = useState<string | null>(null);
  const [markedImage, setMarkedImage] = useState<string | null>(null);
  const [qualityRating, setQualityRating] = useState<number | null>(null);
  const [annotatorBonus, setAnnotatorBonus] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const caseBase = computeCaseBasePay(
    compensationType,
    compensationAmount,
    minMinutesPerCase,
    maxMinutesPerCase,
  );

  useEffect(() => {
    if (qualityRating == null) {
      setAnnotatorBonus("");
      return;
    }
    setAnnotatorBonus(
      String(suggestedQualityAdjustment(qualityRating, caseBase, { wasResubmitted })),
    );
  }, [qualityRating, caseBase, wasResubmitted]);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    void readFileAsDataUrl(f).then((dataUrl) => {
      if (!dataUrl) return;
      setRawImage(dataUrl);
      setMarkedImage(null);
    });
  }

  const onPasteComment = useCallback(async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const file = getClipboardImageFile(e.clipboardData);
    if (!file) return;
    e.preventDefault();
    const dataUrl = await readFileAsDataUrl(file);
    if (!dataUrl) return;
    setRawImage(dataUrl);
    setMarkedImage(null);
  }, []);

  function submit(decision: "ACCEPT" | "REJECT") {
    if (!qualityRating) {
      setMsg(tk("rating_required"));
      return;
    }
    const bonus =
      decision === "ACCEPT"
        ? annotatorBonus.trim()
          ? Number(annotatorBonus)
          : suggestedQualityAdjustment(qualityRating, caseBase, { wasResubmitted })
        : undefined;
    if (bonus != null && !Number.isFinite(bonus)) {
      setMsg(tk("required"));
      return;
    }
    setMsg(null);
    start(async () => {
      const res = await reviewCaseAction({
        caseDbId,
        decision,
        comment,
        screenshotData: markedImage ?? rawImage,
        qualityRating,
        annotatorBonus: bonus,
      });
      if (!res.ok) {
        setMsg(
          res.error === "rating"
            ? tk("rating_required")
            : res.error === "bonus"
              ? tk("required")
              : tk("required"),
        );
      } else {
        setMsg(
          `${decision === "ACCEPT" ? tk("accept") : tk("reject")} — ${tk("compensation_preview")}: ${res.payout}`,
        );
        router.refresh();
      }
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
        )
      : null;

  return (
    <div className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4">
      <label className="block">
        <span className="text-sm text-[var(--muted)]">{tk("review_comment")}</span>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          onPaste={onPasteComment}
          rows={3}
          className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
        />
      </label>
      <p className="text-xs text-[var(--muted)]">{tk("discussion_hint")}</p>
      <StarRating
        label={tk("reviewer_quality_rating")}
        value={qualityRating}
        onChange={setQualityRating}
        required
      />
      {wasResubmitted && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-[var(--text)]">
          {tk("pay_calc_resubmit_note")}
        </p>
      )}
      {qualityRating != null && (
        <label className="block">
          <span className="text-sm text-[var(--muted)]">{tk("case_quality_adjustment")}</span>
          <p className="mt-0.5 text-xs text-[var(--muted)]">{tk("review_quality_adjustment_hint")}</p>
          <input
            type="number"
            step="0.01"
            value={annotatorBonus}
            onChange={(e) => setAnnotatorBonus(e.target.value)}
            className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
          />
          {adjustmentPreview != null && (
            <p className="mt-1 text-xs text-[var(--muted)]">
              {tk("compensation_preview")}: {formatCompensationAmount(lang, adjustmentPreview)}
            </p>
          )}
        </label>
      )}
      <div>
        <span className="text-sm text-[var(--muted)]">{tk("review_screenshot")}</span>
        <input type="file" accept="image/*" onChange={onFile} className="mt-1 block text-sm" />
      </div>
      {(rawImage || markedImage) && (
        <ScreenshotDrawer
          lang={lang}
          imageDataUrl={markedImage ?? rawImage}
          onChange={(d) => setMarkedImage(d)}
        />
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => submit("ACCEPT")}
          className="rounded-md bg-[var(--success)] px-3 py-2 text-sm text-white disabled:opacity-50"
        >
          {tk("accept")}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => submit("REJECT")}
          className="rounded-md bg-[var(--danger)] px-3 py-2 text-sm text-white disabled:opacity-50"
        >
          {tk("reject")}
        </button>
      </div>
      {msg && <p className="text-sm text-[var(--muted)]">{msg}</p>}
    </div>
  );
}
