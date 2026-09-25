import { toDatetimeLocalValue } from "@/lib/format";
import { CaseStatus } from "@prisma/client";

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

/** Recover the active status retained by an automatically expired case. */
export function statusBeforeCaseExpired(
  annotatorId: string | null,
  completedAt: Date | string | null,
): CaseStatus {
  if (!annotatorId) return CaseStatus.AVAILABLE;
  return completedAt ? CaseStatus.REJECTED : CaseStatus.ASSIGNED;
}

export function restoredStatusForDeadlineExtension(input: {
  currentStatus: CaseStatus;
  currentDeadline: Date | string | null;
  nextDeadline: Date | string | null;
  nextExpiresAt: Date | string | null;
  annotatorId: string | null;
  completedAt: Date | string | null;
  now?: Date;
}): CaseStatus {
  const currentDeadline = input.currentDeadline ? new Date(input.currentDeadline) : null;
  const nextDeadline = input.nextDeadline ? new Date(input.nextDeadline) : null;
  const nextExpiresAt = input.nextExpiresAt ? new Date(input.nextExpiresAt) : null;
  const now = input.now ?? new Date();

  if (
    input.currentStatus !== CaseStatus.EXPIRED ||
    !currentDeadline ||
    Number.isNaN(currentDeadline.getTime()) ||
    !nextDeadline ||
    Number.isNaN(nextDeadline.getTime()) ||
    nextDeadline <= currentDeadline ||
    (nextExpiresAt != null &&
      (Number.isNaN(nextExpiresAt.getTime()) || nextExpiresAt <= now))
  ) {
    return input.currentStatus;
  }

  return statusBeforeCaseExpired(input.annotatorId, input.completedAt);
}
