"use client";

export function LoadingProgressBar({ className = "" }: { className?: string }) {
  return (
    <div
      className={`h-1 w-full overflow-hidden bg-[var(--border)] ${className}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Loading"
    >
      <div className="loading-progress-bar h-full w-1/3 bg-[var(--accent)]" />
      <style jsx>{`
        .loading-progress-bar {
          animation: loading-progress 1.1s ease-in-out infinite;
        }
        @keyframes loading-progress {
          0% {
            transform: translateX(-120%);
          }
          100% {
            transform: translateX(420%);
          }
        }
      `}</style>
    </div>
  );
}

export function SectionLoadingPlaceholder({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]">
      <LoadingProgressBar />
      <p className="px-4 py-6 text-sm text-[var(--muted)]">{label}</p>
    </div>
  );
}
