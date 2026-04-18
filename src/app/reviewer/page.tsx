import { redirect } from "next/navigation";
import { getLangFromCookies } from "@/app/actions/lang";
import { listCasesForReviewer } from "@/app/actions/cases";
import { CreateCaseForm } from "@/components/CreateCaseForm";
import { NavBar } from "@/components/NavBar";
import { ReviewCasePanel } from "@/components/ReviewCasePanel";
import { getCurrentUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import type { DictKey, Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import type { AnnotationCase, CompensationType, Review, User } from "@prisma/client";

type Row = AnnotationCase & {
  annotator: User | null;
  reviews: Review[];
};

function compLabel(lang: Lang, type: CompensationType, amount: number) {
  if (type === "PER_MINUTE") return `${amount} × ${t(lang, "comp_per_minute")}`;
  return `${amount} (${t(lang, "comp_per_case")})`;
}

export default async function ReviewerPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "REVIEWER") redirect("/annotator");
  const lang = await getLangFromCookies();
  const tk = (k: DictKey) => t(lang, k);

  let cases: Row[];
  try {
    cases = (await listCasesForReviewer()) as Row[];
  } catch {
    redirect("/login");
  }

  return (
    <div className="min-h-screen">
      <NavBar lang={lang} role="REVIEWER" name={user.name} />
      <main className="mx-auto max-w-6xl space-y-8 px-4 py-8">
        <div>
          <h1 className="text-2xl font-semibold">{tk("reviewer_title")}</h1>
          <p className="text-sm text-[var(--muted)]">{tk("appName")}</p>
        </div>
        <section>
          <h2 className="mb-3 text-lg font-medium">{tk("reviewer_create")}</h2>
          <CreateCaseForm lang={lang} />
        </section>
        <section>
          <h2 className="mb-3 text-lg font-medium">{tk("reviewer_all")}</h2>
          {cases.length === 0 ? (
            <p className="text-[var(--muted)]">{tk("no_cases")}</p>
          ) : (
            <div className="space-y-6">
              {cases.map((c) => (
                <article
                  key={c.id}
                  className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="text-lg font-medium">{c.caseId}</h3>
                      <p className="text-sm text-[var(--muted)]">{c.redbrickProject}</p>
                    </div>
                    <span className="rounded-full bg-[var(--bg)] px-2 py-0.5 text-xs">
                      {tk(`status_${c.status}` as DictKey)}
                    </span>
                  </div>
                  <dl className="mt-3 grid gap-2 text-sm md:grid-cols-2">
                    <div className="md:col-span-2">
                      <dt className="text-[var(--muted)]">{tk("case_guideline")}</dt>
                      <dd>{c.guideline}</dd>
                    </div>
                    <div className="md:col-span-2">
                      <dt className="text-[var(--muted)]">{tk("case_scope")}</dt>
                      <dd>{c.scopeOfWork}</dd>
                    </div>
                    <div>
                      <dt className="text-[var(--muted)]">{tk("case_maxMinutes")}</dt>
                      <dd>{c.maxMinutesPerCase}</dd>
                    </div>
                    <div>
                      <dt className="text-[var(--muted)]">{tk("case_compAmount")}</dt>
                      <dd>{compLabel(lang, c.compensationType, c.compensationAmount)}</dd>
                    </div>
                    <div>
                      <dt className="text-[var(--muted)]">{tk("case_annotator")}</dt>
                      <dd>{c.annotator?.name ?? tk("unassigned")}</dd>
                    </div>
                    <div>
                      <dt className="text-[var(--muted)]">{tk("case_assignedAt")}</dt>
                      <dd>{formatDate(lang, c.assignedAt)}</dd>
                    </div>
                    <div>
                      <dt className="text-[var(--muted)]">{tk("case_completedAt")}</dt>
                      <dd>{formatDate(lang, c.completedAt)}</dd>
                    </div>
                    <div>
                      <dt className="text-[var(--muted)]">{tk("case_annotationMinutes")}</dt>
                      <dd>{c.annotationMinutes ?? "—"}</dd>
                    </div>
                  </dl>
                  {c.reviews[0]?.comment && c.status !== "SUBMITTED" && (
                    <p className="mt-2 text-sm text-[var(--muted)]">
                      {tk("last_review")}: {c.reviews[0].comment}
                    </p>
                  )}
                  {c.status === "SUBMITTED" && (
                    <div className="mt-4 border-t border-[var(--border)] pt-4">
                      <h4 className="mb-2 font-medium">{tk("reviewer_review")}</h4>
                      <ReviewCasePanel lang={lang} caseDbId={c.id} />
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
