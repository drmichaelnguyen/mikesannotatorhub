"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { DictKey, Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";

type FlagResult =
  | { ok: true }
  | { ok: false; error: "already_flagged" | "forbidden" | "not_found" | "auth" | string };

async function flagRedbrickCase(caseDbId: string, comment: string): Promise<FlagResult> {
  const res = await fetch(`/api/cases/${encodeURIComponent(caseDbId)}/redbrick-flag`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ comment: comment.trim() || undefined }),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => null)) as FlagResult | null;
  if (!res.ok || !data?.ok) {
    return {
      ok: false,
      error: data && "error" in data && typeof data.error === "string" ? data.error : "not_found",
    };
  }
  return data;
}

export function AnnotatorRedbrickFlagButton({
  lang,
  caseDbId,
  alreadyFlagged = false,
}: {
  lang: Lang;
  caseDbId: string;
  alreadyFlagged?: boolean;
}) {
  const tk = (k: DictKey) => t(lang, k);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [flagged, setFlagged] = useState(alreadyFlagged);
  const [showComment, setShowComment] = useState(false);
  const [comment, setComment] = useState("");

  if (flagged) {
    return (
      <p className="text-sm text-amber-700" role="status">
        {tk("redbrick_flag_sent")}
      </p>
    );
  }

  if (!showComment) {
    return (
      <div className="flex flex-col items-start gap-1">
        <button
          type="button"
          disabled={pending}
          className="rounded border border-amber-500 bg-amber-500/15 px-2 py-0.5 text-amber-800 hover:bg-amber-500/25 disabled:opacity-50"
          onClick={() => {
            setError(null);
            setShowComment(true);
          }}
        >
          {tk("redbrick_flag")}
        </button>
        {error && (
          <p className="max-w-[20rem] text-xs leading-snug text-[var(--danger)]" role="status">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
      <p className="text-sm text-amber-950">{tk("redbrick_flag_help")}</p>
      <label className="block">
        <span className="text-xs text-[var(--muted)]">{tk("redbrick_flag_comment")}</span>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={2}
          placeholder={tk("redbrick_flag_comment_ph")}
          className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-sm"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          className="rounded border border-amber-600 bg-amber-600 px-2 py-0.5 text-sm text-white hover:bg-amber-700 disabled:opacity-50"
          onClick={() =>
            start(async () => {
              setError(null);
              const result = await flagRedbrickCase(caseDbId, comment);
              if (!result.ok) {
                if (result.error === "already_flagged") {
                  setFlagged(true);
                  return;
                }
                const msg =
                  result.error === "forbidden"
                    ? tk("redbrick_flag_forbidden")
                    : tk("redbrick_flag_failed");
                setError(msg);
                return;
              }
              setFlagged(true);
              setShowComment(false);
              router.refresh();
            })
          }
        >
          {tk("redbrick_flag_submit")}
        </button>
        <button
          type="button"
          disabled={pending}
          className="rounded border border-[var(--border)] px-2 py-0.5 text-sm hover:border-[var(--accent)]"
          onClick={() => {
            setShowComment(false);
            setComment("");
            setError(null);
          }}
        >
          {tk("discussion_cancel_edit")}
        </button>
      </div>
      {error && (
        <p className="text-xs text-[var(--danger)]" role="status">
          {error}
        </p>
      )}
    </div>
  );
}
