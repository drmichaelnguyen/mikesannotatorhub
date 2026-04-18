"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { reviewCaseAction } from "@/app/actions/cases";
import { ScreenshotDrawer } from "@/components/ScreenshotDrawer";
import { getClipboardImageFile, readFileAsDataUrl } from "@/lib/client-image-data";
import type { DictKey, Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";

export function ReviewCasePanel({
  lang,
  caseDbId,
}: {
  lang: Lang;
  caseDbId: string;
}) {
  const tk = (k: DictKey) => t(lang, k);
  const [comment, setComment] = useState("");
  const [rawImage, setRawImage] = useState<string | null>(null);
  const [markedImage, setMarkedImage] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

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
    setMsg(null);
    start(async () => {
      const res = await reviewCaseAction({
        caseDbId,
        decision,
        comment,
        screenshotData: markedImage ?? rawImage,
      });
      if (!res.ok) setMsg(tk("required"));
      else {
        setMsg(
          `${decision === "ACCEPT" ? tk("accept") : tk("reject")} — ${tk("compensation_preview")}: ${res.payout}`,
        );
        router.refresh();
      }
    });
  }

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
