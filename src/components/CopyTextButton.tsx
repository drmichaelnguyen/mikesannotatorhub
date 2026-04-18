"use client";

import { useEffect, useState } from "react";
import type { DictKey, Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";

export function CopyTextButton({
  lang,
  value,
  className = "",
}: {
  lang: Lang;
  value: string;
  className?: string;
}) {
  const tk = (k: DictKey) => t(lang, k);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 1200);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onCopy}
      className={`rounded border border-[var(--border)] px-2 py-0.5 text-xs text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--text)] ${className}`.trim()}
      aria-label={`${tk("copy")} ${value}`}
      title={copied ? tk("copied") : tk("copy")}
    >
      {copied ? tk("copied") : tk("copy")}
    </button>
  );
}
