"use client";

import { buildCasePayProspect } from "@/lib/compensation";
import { formatCompensationAmount } from "@/lib/format";
import type { DictKey, Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import type { CompensationType } from "@prisma/client";

export function buildAnnotatorCasePayProspect(input: {
  compensationType: CompensationType;
  compensationAmount: number;
  minMinutesPerCase: number;
  maxMinutesPerCase: number;
  wasResubmitted?: boolean;
  rushPercent?: number;
  fiveStarBonusPercent?: number;
}) {
  return buildCasePayProspect(
    input.compensationType,
    input.compensationAmount,
    input.minMinutesPerCase,
    input.maxMinutesPerCase,
    { wasResubmitted: input.wasResubmitted, rushPercent: input.rushPercent, fiveStarBonusPercent: input.fiveStarBonusPercent },
  );
}

/** Compact pay/time hints for annotator case lists. */
export function AnnotatorCasePayProspectCells({
  lang,
  prospect,
  isPool = false,
}: {
  lang: Lang;
  prospect: ReturnType<typeof buildAnnotatorCasePayProspect>;
  isPool?: boolean;
}) {
  const optimalClass = isPool ? "text-slate-700" : "text-[var(--muted)]";
  const maxPayClass = isPool ? "text-emerald-800" : "text-[var(--success)]";
  return (
    <>
      <td className={`py-1.5 pr-2 tabular-nums ${optimalClass}`} title={t(lang, "case_optimal_time_hint")}>
        {prospect.optimalMinutes}
      </td>
      <td
        className={`py-1.5 pr-2 tabular-nums font-medium ${maxPayClass}`}
        title={t(lang, "case_maximum_potential_pay_hint")}
      >
        {formatCompensationAmount(lang, prospect.maximumPotentialPay)}
      </td>
    </>
  );
}

/** Full estimate shown before claiming a case as well as during active work. */
export function AnnotatorCasePayProspectCard({
  lang,
  prospect,
  rushForfeitReason = null,
}: {
  lang: Lang;
  prospect: ReturnType<typeof buildAnnotatorCasePayProspect>;
  rushForfeitReason?: "rejected" | "late" | null;
}) {
  const tk = (k: DictKey) => t(lang, k);
  const vi = lang === "vi";
  const fmt = (value: number) => formatCompensationAmount(lang, value);
  const minutes = tk("pay_calc_minutes_unit");
  const perMinute = prospect.type === "PER_MINUTE";
  const rows = [
    {
      label: vi ? "Thù lao cơ bản" : "Base pay",
      amount: prospect.basePayBeforeRush,
      formula: perMinute
        ? `${prospect.optimalMinutes} ${minutes} × ${fmt(prospect.baseRateOrAmount)}/${minutes}`
        : (vi ? "Mức trả cố định cho một ca" : "Fixed amount per case"),
      hint: vi ? "Chưa gồm thưởng khẩn cấp hoặc chất lượng." : "Before urgency or quality bonuses.",
    },
    {
      label: vi ? "Thưởng thêm giờ tối đa" : "Maximum extra-time bonus",
      amount: prospect.maximumOvertimePayBeforeRush,
      formula: perMinute
        ? `½ × ${prospect.maximumOvertimeMinutes} ${minutes} × ${fmt(prospect.baseRateOrAmount)}/${minutes}`
        : (vi ? "Ca trả cố định không có thưởng thêm giờ." : "No extra-time bonus for flat-rate cases."),
      hint: perMinute
        ? (vi ? `Từ ${prospect.optimalMinutes} đến ${prospect.maxMinutes} phút: mức trả cho mỗi phút thêm giảm dần về 0. Không cộng thêm sau ${prospect.maxMinutes} phút.` : `From ${prospect.optimalMinutes} to ${prospect.maxMinutes} minutes, pay per extra minute gradually falls to zero. No additional pay beyond ${prospect.maxMinutes} minutes.`)
        : "",
    },
    {
      label: vi ? `Thưởng khẩn cấp (${prospect.rushPercent}%)` : `Urgency bonus (${prospect.rushPercent}%)`,
      amount: prospect.maximumRushBonus,
      formula: prospect.rushPercent > 0
        ? (vi ? `Mức trả tăng từ ${fmt(prospect.baseRateOrAmount)} lên ${fmt(prospect.effectiveRateOrAmount)}; áp dụng cho thù lao cơ bản và phần thêm giờ.` : `Rate increases from ${fmt(prospect.baseRateOrAmount)} to ${fmt(prospect.effectiveRateOrAmount)}; applies to base pay and extra-time pay.`)
        : (vi ? "Không có thưởng khẩn cấp trong ước tính này." : "No urgency bonus in this estimate."),
      hint: rushForfeitReason === "late" ? tk("case_rush_forfeit_late")
        : rushForfeitReason === "rejected" ? tk("case_rush_forfeit_rejected")
        : prospect.rushPercent > 0 ? (vi ? "Cần nộp đúng hạn; mất thưởng khi nộp trễ hoặc bị từ chối." : "Requires on-time submission; forfeited for late or rejected work.") : "",
    },
    {
      label: vi ? `Thưởng chất lượng 5★ (${prospect.fiveStarBonusPercent}%)` : `5★ quality bonus (${prospect.fiveStarBonusPercent}%)`,
      amount: prospect.fiveStarQualityBonus,
      formula: `${fmt(prospect.minimumCasePay)} × ${prospect.fiveStarBonusPercent}%`,
      hint: vi ? "Tính trên thù lao tối thiểu đã gồm khẩn cấp, không gồm phần thêm giờ. Cần được duyệt 5★." : "Based on minimum case pay including urgency, excluding extra-time pay. Requires a 5★ approval.",
    },
    {
      label: vi ? "Khoản trừ khi nộp lại" : "Resubmission deduction",
      amount: -prospect.resubmitDeduction,
      formula: prospect.resubmitDeduction > 0 ? `−10% × ${fmt(prospect.minimumCasePay)}` : (vi ? "Không áp dụng cho ca này." : "None applies to this estimate."),
      hint: prospect.resubmitDeduction > 0 ? (vi ? "Cùng người gán nhãn nộp lại sau khi bị từ chối." : "The same annotator resubmitted after a rejection.") : "",
    },
    ...(prospect.roundingAdjustment !== 0 ? [{
      label: vi ? "Điều chỉnh làm tròn" : "Rounding adjustment",
      amount: prospect.roundingAdjustment,
      formula: vi ? "Khớp cách làm tròn khoản thanh toán cuối cùng." : "Matches rounding of the final payout.",
      hint: "",
    }] : []),
  ];
  return (
    <section className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-[var(--text)]">{vi ? "Chi tiết thù lao tối đa" : "Maximum pay breakdown"}</h3>
          <p className="mt-1 text-xs text-[var(--muted)]">{vi ? "Ước tính trước khi nhận ca — có điều kiện, không phải khoản trả đảm bảo." : "Estimate available before taking the case — conditional, not guaranteed pay."}</p>
        </div>
        <div className="text-xl font-semibold tabular-nums text-[var(--success)]">{fmt(prospect.maximumPotentialPay)}</div>
      </div>
      <p className="mt-3 text-sm text-[var(--muted)]">
        {perMinute
          ? (vi ? `Thời gian khuyến nghị: ${prospect.minMinutes}–${prospect.maxMinutes} phút. Thời gian tối ưu: ${prospect.optimalMinutes} phút. Hoàn tất sớm hơn vẫn giữ thù lao cơ bản trước điều chỉnh chất lượng.` : `Recommended time: ${prospect.minMinutes}–${prospect.maxMinutes} minutes. Optimal time: ${prospect.optimalMinutes} minutes. Finishing sooner retains the base pay before quality adjustments.`)
          : (vi ? "Thù lao cố định cho mỗi ca; thời gian làm không làm tăng thù lao." : "Flat pay per case; spending more time does not increase time pay.")}
      </p>
      <p className="mt-2 text-xs text-[var(--muted)]">
        {vi ? "Cơ sở tính thưởng chất lượng" : "Quality bonus calculation base"}: {perMinute ? `${prospect.optimalMinutes} ${minutes} × ${fmt(prospect.effectiveRateOrAmount)}/${minutes} = ` : ""}{fmt(prospect.minimumCasePay)} {vi ? "(đã gồm khẩn cấp; chưa gồm thêm giờ)." : "(includes urgency; excludes extra-time pay)."}
      </p>
      <dl className="mt-3 divide-y divide-[var(--border)] text-sm">
        {rows.map((row, index) => (
          <div key={row.label} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 py-3">
            <dt className="font-medium text-[var(--text)]">{row.label}</dt>
            <dd className="text-right font-medium tabular-nums text-[var(--text)]">{row.amount < 0 ? "−" : index > 0 && row.amount > 0 ? "+" : ""}{fmt(Math.abs(row.amount))}</dd>
            <dd className="col-span-2 mt-1 text-xs text-[var(--muted)]">{row.formula}{row.hint && <span className="mt-1 block">{row.hint}</span>}</dd>
          </div>
        ))}
      </dl>
      <div className="border-t border-[var(--border)] pt-3">
        <p className="font-medium text-[var(--text)]">{tk("case_maximum_potential_pay")}: <span className="text-[var(--success)]">{fmt(prospect.maximumPotentialPay)}</span></p>
        <p className="mt-1 break-words text-xs tabular-nums text-[var(--muted)]">{rows.map((row, index) => `${index === 0 ? "" : row.amount < 0 ? " − " : " + "}${fmt(Math.abs(row.amount))}`).join("")} = {fmt(prospect.maximumPotentialPay)}</p>
        <p className="mt-2 text-xs text-[var(--muted)]">
          {perMinute && (vi ? "Tối đa giả định làm đến giới hạn thời gian trả công và được duyệt 5★. Làm ít phút thêm hơn sẽ nhận ít thưởng thêm giờ hơn. " : "The maximum assumes the paid time limit and 5★ approval. Fewer extra minutes mean less extra-time pay. ")}
          {vi ? "4★ không có thưởng chất lượng; 3★/2★/1★ trừ 10%/25%/40% thù lao tối thiểu. Ca bị từ chối không được trả. Người đánh giá có thể điều chỉnh khoản thưởng khi duyệt." : "4★ adds no quality bonus; 3★/2★/1★ deduct 10%/25%/40% of minimum case pay. Rejected cases pay zero. Reviewers can adjust the bonus at approval."}
        </p>
      </div>
    </section>
  );
}
