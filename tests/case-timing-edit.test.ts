import assert from "node:assert/strict";
import { test } from "node:test";
import { adjustExpiryForDeadlineChange } from "../src/lib/case-timing-edit";

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
