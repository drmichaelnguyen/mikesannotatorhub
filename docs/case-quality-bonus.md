# Case-specific five-star bonuses

Create cases includes a required **5★ quality bonus for these cases (%)** field (0–100, up to two decimal places). The suggestion comes from the newest case with the same Project and Scope of Work, then the project default, then 15%. Changing project or scope reloads the suggestion. Reviewers can edit it before creating the batch.

Every newly inserted case saves its own `fiveStarBonusPercent`. Existing duplicate cases skipped during creation retain their settings. The saved value drives annotator pay estimates, maximum-pay breakdowns, and automatic review bonuses. Later project-default changes do not alter saved case percentages. Manual review bonus overrides remain available.

Legacy cases have NULL in the new column and continue to use their project default. Already approved payouts use the stored monetary bonus.

For another database/deployment, apply the additive migration before starting the updated app:

```sh
node --env-file=.env scripts/migrate-case-quality-bonus.mjs
npx prisma generate
```

The migration can be rerun safely. It only adds the nullable column; it does not rewrite old payouts or case data.
