"use client";

import { useEffect, useState } from "react";
import type { DictKey, Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";

const STORAGE_KEY = "annotator-pay-explainer-dismissed-v1";

export function AnnotatorPayExplainer({ lang }: { lang: Lang }) {
  const tk = (k: DictKey) => t(lang, k);
  const [dismissed, setDismissed] = useState<boolean | null>(null);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  function dismiss() {
    setDismissed(true);
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
  }

  if (dismissed == null) return null;

  if (dismissed) {
    return (
      <button
        type="button"
        onClick={() => {
          setDismissed(false);
          setOpen(true);
        }}
        className="text-left text-sm text-[var(--accent)] underline-offset-2 hover:underline"
      >
        {tk("pay_explainer_show")}
      </button>
    );
  }

  return (
    <div
      className="rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/5 px-4 py-3"
      role="region"
      aria-label={tk("pay_explainer_title")}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-start gap-2 text-left"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <span className="mt-0.5 text-[var(--accent)]" aria-hidden>
            {open ? "▾" : "▸"}
          </span>
          <span>
            <span className="block text-sm font-semibold text-[var(--text)]">
              {tk("pay_explainer_title")}
            </span>
            <span className="mt-0.5 block text-xs text-[var(--muted)]">
              {tk("pay_explainer_subtitle")}
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 rounded-md border border-[var(--border)] px-2.5 py-1 text-xs hover:border-[var(--accent)]"
        >
          {tk("pay_explainer_dismiss")}
        </button>
      </div>
      {open && (
        <ul className="mt-3 list-disc space-y-1.5 pl-6 text-sm text-[var(--text)]">
          <li>{tk("pay_explainer_base")}</li>
          <li>{tk("pay_explainer_early")}</li>
          <li>{tk("pay_explainer_overtime")}</li>
          <li>{tk("pay_explainer_quality")}</li>
          <li>{tk("pay_explainer_resubmit")}</li>
          <li>{tk("pay_explainer_reject")}</li>
          <li>{tk("pay_explainer_tip")}</li>
        </ul>
      )}
    </div>
  );
}
