"use client";

import { useCallback, useState, type ReactNode } from "react";
import { LoadingProgressBar } from "@/components/LoadingProgressBar";

export function LazyCollapsibleSection<T>({
  title,
  defaultOpen = false,
  load,
  children,
  loadingLabel = "Loading…",
  errorLabel = "Could not load this section.",
}: {
  title: string;
  defaultOpen?: boolean;
  load: () => Promise<T>;
  children: (data: T) => ReactNode;
  loadingLabel?: string;
  errorLabel?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const ensureLoaded = useCallback(async () => {
    if (data !== null || loading) return;
    setLoading(true);
    setError(false);
    try {
      setData(await load());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [data, load, loading]);

  const handleToggle = useCallback(() => {
    const next = !open;
    setOpen(next);
    if (next) {
      void ensureLoaded();
    }
  }, [open, ensureLoaded]);

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]">
      <button
        type="button"
        onClick={handleToggle}
        className="w-full cursor-pointer px-4 py-3 text-left text-lg font-medium hover:bg-[var(--bg)]"
        aria-expanded={open}
      >
        {title}
      </button>
      {open && (
        <div className="border-t border-[var(--border)]">
          {loading && (
            <>
              <LoadingProgressBar />
              <p className="px-4 py-6 text-sm text-[var(--muted)]">{loadingLabel}</p>
            </>
          )}
          {!loading && error && (
            <p className="px-4 py-6 text-sm text-[var(--danger)]">{errorLabel}</p>
          )}
          {!loading && !error && data !== null && <div className="p-4">{children(data)}</div>}
        </div>
      )}
    </div>
  );
}
