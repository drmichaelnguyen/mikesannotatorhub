import { useEffect, useState } from "react";

/** Trims input and debounces; clearing the input applies an empty needle immediately. */
export function useDebouncedSearchNeedle(rawInput: string, delayMs: number): string {
  const trimmed = rawInput.trim();
  const [needle, setNeedle] = useState(trimmed);
  useEffect(() => {
    if (trimmed === "") {
      setNeedle("");
      return;
    }
    const id = window.setTimeout(() => setNeedle(trimmed), delayMs);
    return () => window.clearTimeout(id);
  }, [trimmed, delayMs]);
  return needle;
}
