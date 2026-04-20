"use client";

function starLabel(value: number) {
  return `${value} star${value === 1 ? "" : "s"}`;
}

export function StarRating({
  label,
  value,
  onChange,
  required = false,
}: {
  label: string;
  value: number | null;
  onChange?: (value: number) => void;
  required?: boolean;
}) {
  const interactive = typeof onChange === "function";
  return (
    <div className="space-y-1">
      <div className="text-sm text-[var(--muted)]">
        {label}
        {required ? " *" : ""}
      </div>
      <div
        className="inline-flex items-center gap-1"
        role={interactive ? "radiogroup" : undefined}
        aria-label={label}
        aria-required={required || undefined}
      >
        {[1, 2, 3, 4, 5].map((n) => {
          const filled = value != null && n <= value;
          if (!interactive) {
            return (
              <span
                key={n}
                className={`text-base ${filled ? "text-amber-400" : "text-[var(--muted)]/50"}`}
                aria-hidden
                title={starLabel(n)}
              >
                {filled ? "★" : "☆"}
              </span>
            );
          }
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              className={`text-base transition hover:scale-110 ${filled ? "text-amber-400" : "text-[var(--muted)]/50 hover:text-amber-300"}`}
              aria-label={`${label}: ${starLabel(n)}`}
              aria-pressed={value === n}
            >
              {filled ? "★" : "☆"}
            </button>
          );
        })}
      </div>
    </div>
  );
}
