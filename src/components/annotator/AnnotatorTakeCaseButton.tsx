"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  formatAnnotatorTakeBlockError,
  formatAnnotatorTakeBlockMessage,
  type TakeCaseBlockReason,
} from "@/lib/annotator-take-case";
import type { DictKey, Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";

type AssignCaseResult =
  | { ok: true }
  | { ok: false; error: "pending_review_ack" | "active_case" | "state" | "auth" | string };

async function assignCase(caseDbId: string): Promise<AssignCaseResult> {
  const res = await fetch(`/api/cases/${encodeURIComponent(caseDbId)}/assign`, {
    method: "POST",
    cache: "no-store",
  });
  const data = (await res.json().catch(() => null)) as AssignCaseResult | null;
  if (!res.ok || !data?.ok) {
    return {
      ok: false,
      error: data && "error" in data && typeof data.error === "string" ? data.error : "state",
    };
  }
  return data;
}

export function AnnotatorTakeCaseButton({
  lang,
  caseDbId,
  blockReason = null,
  activeCaseId = null,
  className = "",
}: {
  lang: Lang;
  caseDbId: string;
  blockReason?: TakeCaseBlockReason | null;
  activeCaseId?: string | null;
  className?: string;
}) {
  const tk = (k: DictKey) => t(lang, k);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const blockMessage = blockReason
    ? formatAnnotatorTakeBlockMessage(lang, blockReason, activeCaseId)
    : null;

  return (
    <div className={`flex flex-col items-start gap-1 ${className}`}>
      <button
        type="button"
        disabled={pending || Boolean(blockReason)}
        title={blockMessage ?? undefined}
        className="rounded border border-[var(--accent)] bg-[var(--accent)]/15 px-2 py-0.5 text-[var(--accent)] hover:bg-[var(--accent)]/25 disabled:opacity-50"
        onClick={() =>
          start(async () => {
            setError(null);
            const result = await assignCase(caseDbId);
            if (!result.ok) {
              setError(formatAnnotatorTakeBlockError(lang, result.error, activeCaseId));
              return;
            }
            router.refresh();
          })
        }
      >
        {tk("assign")}
      </button>
      {(blockMessage || error) && (
        <p className="max-w-[18rem] text-xs leading-snug text-[var(--danger)]" role="status">
          {error ?? blockMessage}
        </p>
      )}
    </div>
  );
}
