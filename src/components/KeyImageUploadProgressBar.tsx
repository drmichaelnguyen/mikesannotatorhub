"use client";

import type { KeyImageUploadProgress } from "@/lib/upload-key-images-client";

export function KeyImageUploadProgressBar({
  progress,
  label,
}: {
  progress: KeyImageUploadProgress;
  label: string;
}) {
  return (
    <div className="space-y-1.5 rounded-md border border-[var(--border)] bg-[var(--bg)] p-3">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-[var(--muted)]">{label}</span>
        <span className="font-medium tabular-nums text-[var(--text)]">{progress.percent}%</span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-[var(--border)]"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress.percent}
        aria-label={label}
      >
        <div
          className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-200 ease-out"
          style={{ width: `${progress.percent}%` }}
        />
      </div>
      <p className="text-xs text-[var(--muted)]">
        {progress.filesDone}/{progress.filesTotal}
        {progress.chunkCount > 0
          ? ` · ${progress.chunkIndex}/${progress.chunkCount}`
          : ""}
      </p>
    </div>
  );
}
