import { redirect } from "next/navigation";
import { getLangFromCookies } from "@/app/actions/lang";
import { listAnnotatorsForAssignment, listCasesForReviewer } from "@/app/actions/cases";
import { CollapsibleSection } from "@/components/CollapsibleSection";
import { CreateAnnotatorForm } from "@/components/CreateAnnotatorForm";
import { CreateCaseForm } from "@/components/CreateCaseForm";
import { NavBar } from "@/components/NavBar";
import { ReviewerWorkboard } from "@/components/reviewer/ReviewerWorkboard";
import { getCurrentUser } from "@/lib/auth";
import type { DictKey } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import { serializeReviewerCase } from "@/lib/reviewer-serialize";
import type { ReviewerCaseRow } from "@/lib/reviewer-types";

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

  const serialized = cases.map(serializeReviewerCase);

  return (
    <div className="min-h-screen">
      <NavBar lang={lang} role="REVIEWER" name={user.name} />
      <main className="mx-auto max-w-6xl space-y-8 px-4 py-8">
        <div>
          <h1 className="text-2xl font-semibold">{tk("reviewer_title")}</h1>
          <p className="text-sm text-[var(--muted)]">{tk("appName")}</p>
        </div>
        <section>
          <CollapsibleSection title={tk("reviewer_create_annotator")}>
            <CreateAnnotatorForm lang={lang} />
          </CollapsibleSection>
        </section>
        <section>
          <CollapsibleSection title={tk("reviewer_create")}>
            <CreateCaseForm lang={lang} />
          </CollapsibleSection>
        </section>
        <section>
          <ReviewerWorkboard lang={lang} cases={serialized} annotators={annotators} />
        </section>
      </main>
    </div>
  );
}
