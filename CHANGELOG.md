# Changelog

All notable changes to this project are documented in this file.

## [1.0.3] — 2026-05-21

### Case detail drawer

- Fix case **Details** drawer not opening when using in-board actions: URL updates via `history.replaceState` no longer fight with `useSearchParams` (read `?case=` from the address bar instead).
- Open/close case detail without full page RSC refetch (`case-detail-url` helpers + custom event for notifications).
- Faster close: overlay hides immediately; heavy discussion panel unmounts on the next animation frame.
- `CaseDetailLink` supports custom `onClick` handlers without triggering a Next.js navigation.

### Reviewer ↔ annotator workspace

- Reviewers using the annotator UI (`email+annotator@…` seed convention) see and act on the linked annotator’s cases, assignments, notes, and review acknowledgments (`annotator-workspace`).

### Discussion & review ack UX

- Discussion thread shows a loading state until notes are fetched; composer stays hidden until load completes.
- Review acknowledgment modal: Escape/backdrop close, “View case” opens the detail drawer, improved accessibility labels.

### i18n

- New string: `discussion_loading`.

## [1.0.2] — 2026-05-13

- Multi-topic cases (junction table), topic detail modal, broader board search.
- Annotator review acknowledgment flow.
- SQL migration helpers for case topics.

## [1.0.1] and earlier

See git history for prior releases.
