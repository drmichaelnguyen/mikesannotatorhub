# Action logs

The app writes daily JSONL files to `logs/actions/YYYY-MM-DD.jsonl`. Set `ACTION_LOG_DIR` to a persistent, private directory in production. No database migration is needed. Logs are excluded from Git. Files use owner-only permissions when created; server filesystem access is required to read them.

Each server action attempt and outcome records UTC time, a reference ID, authenticated session user ID (or null), action name, submitted field names, selected internal identifiers, duration, and rejection/error code. Case creation records the count immediately after case insertion so a later failure can be distinguished from a failure before insertion. Unexpected case-creation errors show the same reference ID in the form.

Coverage: case creation/editing/assignment/submission/review/deletion, guide/topic/template changes, compensation settings, account creation/login/logout, notifications marked read, Redbrick flag changes, and existing POST/PATCH/DELETE case API handlers. Nested action handlers share a reference ID. Browser form submissions, native validation blocks, and changed fields on blur are separately labeled `client_reported`; they are best-effort intentions, not proof of a saved change. Login intent events are not accepted without a session. Reads, navigation, arbitrary button clicks, direct database edits and background jobs are not audited.

No passwords, cookies, tokens, email addresses, clinical text, input values, filenames or file contents are recorded. This is a debugging log, not a tamper-proof audit trail or before/after data archive. `succeeded` means the handler completed; `failed` can include partial writes. For API handlers the status determines the outer outcome; the nested action records application-level rejection reasons.

Find a reported failure:

```sh
rg 'REFERENCE-ID' logs/actions
```

Inspect recent events:

```sh
tail -n 100 logs/actions/YYYY-MM-DD.jsonl
```

Files rotate daily; configure your deployment's retention/archival policy for this directory (for example, 30 days). Multiple instances need a shared persistent destination or centralized collection. If disk writes fail, events fall back to server stderr with `ACTION_LOG_WRITE_FAILED`, without failing the user's action.

Run regression checks with `npx tsx --test tests/action-log.test.ts`.
