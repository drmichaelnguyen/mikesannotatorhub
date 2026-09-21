import { toDatetimeLocalValue } from "@/lib/format";

/**
 * Keep an existing expiry grace period when a later deadline would otherwise
 * reach or pass the hard expiry cutoff.
 */
export function adjustExpiryForDeadlineChange(
  previousDeadline: string,
  nextDeadline: string,
  currentExpiry: string,
): string {
  const previous = new Date(previousDeadline);
  const next = new Date(nextDeadline);
  const expiry = new Date(currentExpiry);
  if (
    !previousDeadline.trim() ||
    !nextDeadline.trim() ||
    !currentExpiry.trim() ||
    Number.isNaN(previous.getTime()) ||
    Number.isNaN(next.getTime()) ||
    Number.isNaN(expiry.getTime()) ||
    next < expiry
  ) {
    return currentExpiry;
  }

  const graceMs = expiry.getTime() - previous.getTime();
  if (graceMs <= 0) return currentExpiry;
  return toDatetimeLocalValue(new Date(next.getTime() + graceMs));
}
