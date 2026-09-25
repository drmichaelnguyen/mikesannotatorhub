import assert from "node:assert/strict";
import { test } from "node:test";
import {
  adjustExpiryForDeadlineChange,
  restoredStatusForDeadlineExtension,
  statusBeforeCaseExpired,
} from "../src/lib/case-timing-edit";

test("extending a deadline beyond expiry preserves the expiry grace period", () => {
  assert.equal(
    adjustExpiryForDeadlineChange(
      "2026-10-01T12:00",
      "2026-10-02T18:00",
      "2026-10-01T20:00",
    ),
    "2026-10-03T02:00",
  );
});

test("a deadline change before expiry leaves the explicit expiry unchanged", () => {
  assert.equal(
    adjustExpiryForDeadlineChange(
      "2026-10-01T12:00",
      "2026-10-01T16:00",
      "2026-10-01T20:00",
    ),
    "2026-10-01T20:00",
  );
});

test("blank or invalid timing values are left for form validation", () => {
  assert.equal(adjustExpiryForDeadlineChange("", "2026-10-02T18:00", "2026-10-01T20:00"), "2026-10-01T20:00");
  assert.equal(adjustExpiryForDeadlineChange("bad", "2026-10-02T18:00", "2026-10-01T20:00"), "2026-10-01T20:00");
});

test("expired cases recover the active status represented by their retained work", () => {
  assert.equal(statusBeforeCaseExpired(null, null), "AVAILABLE");
  assert.equal(statusBeforeCaseExpired("annotator-1", null), "ASSIGNED");
  assert.equal(
    statusBeforeCaseExpired("annotator-1", "2026-10-01T12:00:00.000Z"),
    "REJECTED",
  );
});

test("only a live deadline extension restores an expired case", () => {
  const base = {
    currentStatus: "EXPIRED" as const,
    currentDeadline: "2026-10-01T12:00:00.000Z",
    nextDeadline: "2026-10-02T12:00:00.000Z",
    nextExpiresAt: "2026-10-02T20:00:00.000Z",
    annotatorId: "annotator-1",
    completedAt: null,
    now: new Date("2026-10-01T18:00:00.000Z"),
  };
  assert.equal(restoredStatusForDeadlineExtension(base), "ASSIGNED");
  assert.equal(
    restoredStatusForDeadlineExtension({
      ...base,
      nextDeadline: base.currentDeadline,
    }),
    "EXPIRED",
  );
  assert.equal(
    restoredStatusForDeadlineExtension({
      ...base,
      nextExpiresAt: "2026-10-01T17:00:00.000Z",
    }),
    "EXPIRED",
  );
});
