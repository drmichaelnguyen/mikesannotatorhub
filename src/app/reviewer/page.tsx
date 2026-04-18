import { redirect } from "next/navigation";
import { getLangFromCookies } from "@/app/actions/lang";
import { listAnnotatorsForAssignment, listCasesForReviewer } from "@/app/actions/cases";
import { CreateAnnotatorForm } from "@/components/CreateAnnotatorForm";
import { CreateCaseForm } from "@/components/CreateCaseForm";
import { NavBar } from "@/components/NavBar";
import { ReviewerCaseBlock, type ReviewerCaseRow } from "@/components/ReviewerCaseBlock";
import { getCurrentUser } from "@/lib/auth";
import type { DictKey } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import { CaseStatus } from "@prisma/client";

export default async function ReviewerPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "REVIEWER") redirect("/annotator");
  const lang = await getLangFromCookies();
  const tk = (k: DictKey) => t(lang, k);

  let cases: ReviewerCaseRow[];
  let annotators: Awaited<ReturnType<typeof listAnnotatorsForAssignment>>;
  try {
    [cases, annotators] = await Promise.all([
      listCasesForReviewer() as Promise<ReviewerCaseRow[]>,
      listAnnotatorsForAssignment(),
    ]);
  } catch {
    redirect("/login");
  }

  const pendingAudit = cases.filter((c) => c.status === CaseStatus.SUBMITTED);
  const audited = cases.filter(
    (c) => c.status === CaseStatus.AUDITED || c.status === CaseStatus.ACCEPTED,
  );
  const other = cases.filter(
    (c) =>
      c.status !== CaseStatus.SUBMITTED &&
      c.status !== CaseStatus.AUDITED &&
      c.status !== CaseStatus.ACCEPTED,
  );

  return (
    <div className="min-h-screen">
      <NavBar lang={lang} role="REVIEWER" name={user.name} />
      <main className="mx-auto max-w-6xl space-y-8 px-4 py-8">
        <div>
          <h1 className="text-2xl font-semibold">{tk("reviewer_title")}</h1>
          <p className="text-sm text-[var(--muted)]">{tk("appName")}</p>
        </div>
        <section>
          <h2 className="mb-3 text-lg font-medium">{tk("reviewer_create_annotator")}</h2>
          <CreateAnnotatorForm lang={lang} />
        </section>
        <section>
          <h2 className="mb-3 text-lg font-medium">{tk("reviewer_create")}</h2>
          <CreateCaseForm lang={lang} />
        </section>

        <section>
          <h2 className="mb-3 text-lg font-medium">{tk("reviewer_section_pending_audit")}</h2>
          <p className="mb-3 text-sm text-[var(--muted)]">{tk("reviewer_section_pending_audit_hint")}</p>
          {pendingAudit.length === 0 ? (
            <p className="text-[var(--muted)]">{tk("reviewer_no_pending_audit")}</p>
          ) : (
            <div className="space-y-6">
              {pendingAudit.map((c) => (
                <ReviewerCaseBlock key={c.id} lang={lang} c={c} annotators={annotators} />
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-lg font-medium">{tk("reviewer_section_audited")}</h2>
          <p className="mb-3 text-sm text-[var(--muted)]">{tk("reviewer_section_audited_hint")}</p>
          {audited.length === 0 ? (
            <p className="text-[var(--muted)]">{tk("reviewer_no_audited")}</p>
          ) : (
            <div className="space-y-6">
              {audited.map((c) => (
                <ReviewerCaseBlock key={c.id} lang={lang} c={c} annotators={annotators} />
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-lg font-medium">{tk("reviewer_section_other")}</h2>
          {other.length === 0 ? (
            <p className="text-[var(--muted)]">{tk("reviewer_no_other_cases")}</p>
          ) : (
            <div className="space-y-6">
              {other.map((c) => (
                <ReviewerCaseBlock key={c.id} lang={lang} c={c} annotators={annotators} />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
