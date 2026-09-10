"use client";
import { useMemo } from "react";
import { formatCompensationAmount } from "@/lib/format";
import { rushPercentFromHours } from "@/lib/compensation";
import { t, type DictKey, type Lang } from "@/lib/i18n";

const DEADLINE_HOUR_OPTIONS = [4, 6, 8, 12, 16, 24, 36, 48, 72, 96, 120, 168] as const;
const EXPIRY_GRACE_HOUR_OPTIONS = [1, 2, 4, 8, 12, 24, 48, 72, 96, 168] as const;


export function CaseTimingFields({ lang, deadlineHours, expiryGraceHours, setDeadlineHours, setExpiryGraceHours, baseRate, previewStart, urgencyHint }: {
  lang: Lang; deadlineHours: number; expiryGraceHours: number;
  setDeadlineHours: (value: number) => void; setExpiryGraceHours: (value: number) => void;
  baseRate: string; previewStart: number; urgencyHint?: string;
}) {
  const tk = (key: DictKey) => t(lang, key);
  const rushPreview = rushPercentFromHours(deadlineHours);
  const deadlineIndex = Math.max(
    0,
    DEADLINE_HOUR_OPTIONS.indexOf(deadlineHours as (typeof DEADLINE_HOUR_OPTIONS)[number]),
  );
  const deadlineAt = useMemo(
    () => new Date(previewStart + deadlineHours * 60 * 60 * 1000),
    [deadlineHours, previewStart],
  );
  const deadlineLabel = useMemo(
    () =>
      deadlineAt.toLocaleString(lang === "vi" ? "vi-VN" : "en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    [deadlineAt, lang],
  );
  const expiryHours = deadlineHours + expiryGraceHours;
  const expiryIndex = Math.max(
    0,
    EXPIRY_GRACE_HOUR_OPTIONS.indexOf(
      expiryGraceHours as (typeof EXPIRY_GRACE_HOUR_OPTIONS)[number],
    ),
  );
  const expiryAt = useMemo(
    () => new Date(previewStart + expiryHours * 60 * 60 * 1000),
    [expiryHours, previewStart],
  );
  const expiryLabel = useMemo(
    () =>
      expiryAt.toLocaleString(lang === "vi" ? "vi-VN" : "en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    [expiryAt, lang],
  );
  const parsedBaseRate = Number(baseRate);
  const urgencyBonusAmount =
    Number.isFinite(parsedBaseRate) && parsedBaseRate > 0 && rushPreview > 0
      ? Math.round(parsedBaseRate * (rushPreview / 100) * 100) / 100
      : null;
  const calculatedUrgencyBonusLabel =
    rushPreview <= 0
      ? tk("case_rush_bonus_none_live")
      : urgencyBonusAmount != null
        ? tk("case_rush_bonus_amount_live").replace(
            "{amount}",
            formatCompensationAmount(lang, urgencyBonusAmount),
          )
        : tk("case_rush_bonus_percent_live").replace("{percent}", String(rushPreview));

  const urgencyBonusLabel = urgencyHint ?? calculatedUrgencyBonusLabel;
  return (<>
      <div className="md:col-span-2">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <span className="text-sm text-[var(--muted)]">{tk("case_urgency")}</span>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm tabular-nums">
            <span className="font-medium text-[var(--text)]">
              {tk("case_urgency_hours_live").replace("{hours}", String(deadlineHours))}
            </span>
            <span className="text-[var(--muted)]">
              {tk("case_urgency_deadline_live").replace("{datetime}", deadlineLabel)}
            </span>
            <span
              className={
                rushPreview > 0
                  ? "font-semibold text-[var(--accent)]"
                  : "font-medium text-[var(--muted)]"
              }
            >
              {urgencyBonusLabel}
            </span>
          </div>
        </div>
        <input type="hidden" name="deadlineHours" value={deadlineHours} />
        <input
          type="range"
          min={0}
          max={DEADLINE_HOUR_OPTIONS.length - 1}
          step={1}
          value={deadlineIndex}
          aria-label={tk("case_urgency")}
          onChange={(e) => {
            const next = DEADLINE_HOUR_OPTIONS[Number(e.target.value)];
            if (next != null) setDeadlineHours(next);
          }}
          className="mt-3 w-full accent-[var(--accent)]"
        />
        <div className="mt-1 flex justify-between text-[10px] uppercase tracking-wide text-[var(--muted)]">
          <span>{urgencyHint ? "4h" : "4h · +15%"}</span>
          <span>{urgencyHint ? "24h" : "24h · +10%"}</span>
          <span>72h+</span>
        </div>
        <p className="mt-2 text-xs text-[var(--muted)]">{tk("case_deadline_hint")}</p>
      </div>
      <div className="md:col-span-2">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <span className="text-sm text-[var(--muted)]">{tk("case_expiry")}</span>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm tabular-nums">
            <span className="font-medium text-[var(--text)]">
              {tk("case_expiry_hours_live").replace("{hours}", String(expiryGraceHours))}
            </span>
            <span className="text-[var(--muted)]">
              {tk("case_expiry_live").replace("{datetime}", expiryLabel)}
            </span>
          </div>
        </div>
        <input type="hidden" name="expiryHours" value={expiryHours} />
        <input
          type="range"
          min={0}
          max={EXPIRY_GRACE_HOUR_OPTIONS.length - 1}
          step={1}
          value={expiryIndex}
          aria-label={tk("case_expiry")}
          onChange={(e) => {
            const next = EXPIRY_GRACE_HOUR_OPTIONS[Number(e.target.value)];
            if (next != null) setExpiryGraceHours(next);
          }}
          className="mt-3 w-full accent-[var(--accent)]"
        />
        <div className="mt-1 flex justify-between text-[10px] uppercase tracking-wide text-[var(--muted)]">
          <span>+{EXPIRY_GRACE_HOUR_OPTIONS[0]}h</span>
          <span>+{EXPIRY_GRACE_HOUR_OPTIONS.at(-1)}h</span>
        </div>
        <p className="mt-2 text-xs text-[var(--muted)]">{tk("case_expiry_hint")}</p>
      </div>
  </>);
}
