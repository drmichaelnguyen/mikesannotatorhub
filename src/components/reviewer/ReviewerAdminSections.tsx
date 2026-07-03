"use client";

import { useCallback } from "react";
import {
  listAnnotatorsForAssignment,
  listGuidesAndTopicsLite,
  listGuidesForManager,
  listScopeOfWorkTemplatesAction,
  listTopicsForManager,
} from "@/app/actions/cases";
import { CreateAnnotatorForm } from "@/components/CreateAnnotatorForm";
import { CreateCaseForm } from "@/components/CreateCaseForm";
import { LazyCollapsibleSection } from "@/components/LazyCollapsibleSection";
import { CollapsibleSection } from "@/components/CollapsibleSection";
import { GuideManager, TopicManager } from "@/components/reviewer/GuideTopicManager";
import { ReviewerAdvancedDataView } from "@/components/reviewer/ReviewerAdvancedDataView";
import { ScopeOfWorkTemplateManager } from "@/components/reviewer/ScopeOfWorkTemplateManager";
import { listReviewerAdvancedDataAction } from "@/app/actions/advanced-data";
import { listUnresolvedRedbrickFlagsAction } from "@/app/actions/redbrick-flags";
import { ReviewerFlaggedCasesPanel } from "@/components/reviewer/ReviewerFlaggedCasesPanel";
import type { DictKey, Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";

export function ReviewerAdminSections({
  lang,
  scopeOptions,
  rbProjectOptions,
}: {
  lang: Lang;
  scopeOptions: string[];
  rbProjectOptions: string[];
}) {
  const tk = (k: DictKey) => t(lang, k);
  const loadGuides = useCallback(() => listGuidesForManager(), []);
  const loadTopics = useCallback(() => listTopicsForManager(), []);
  const loadCreateCase = useCallback(async () => {
    const [annotators, guidesAndTopics] = await Promise.all([
      listAnnotatorsForAssignment(),
      listGuidesAndTopicsLite(),
    ]);
    return { annotators, guides: guidesAndTopics.guides, topics: guidesAndTopics.topics };
  }, []);
  const loadScopeTemplates = useCallback(() => listScopeOfWorkTemplatesAction(), []);
  const loadAdvancedData = useCallback(() => listReviewerAdvancedDataAction(), []);
  const loadRedbrickFlags = useCallback(() => listUnresolvedRedbrickFlagsAction(), []);

  return (
    <>
      <section>
        <LazyCollapsibleSection
          title={tk("redbrick_flags_section")}
          load={loadRedbrickFlags}
          loadingLabel={tk("ui_loading")}
          errorLabel={tk("ui_load_failed")}
        >
          {(flags) => <ReviewerFlaggedCasesPanel lang={lang} flags={flags} />}
        </LazyCollapsibleSection>
      </section>
      <section>
        <LazyCollapsibleSection
          title={tk("reviewer_guide_section")}
          load={loadGuides}
          loadingLabel={tk("ui_loading")}
          errorLabel={tk("ui_load_failed")}
        >
          {(guides) => <GuideManager lang={lang} guides={guides} />}
        </LazyCollapsibleSection>
      </section>
      <section>
        <LazyCollapsibleSection
          title={tk("reviewer_topic_section")}
          load={loadTopics}
          loadingLabel={tk("ui_loading")}
          errorLabel={tk("ui_load_failed")}
        >
          {(topics) => (
            <TopicManager
              lang={lang}
              topics={topics}
              scopeOptions={scopeOptions}
              rbProjectOptions={rbProjectOptions}
            />
          )}
        </LazyCollapsibleSection>
      </section>
      <section>
        <CollapsibleSection title={tk("reviewer_create_annotator")}>
          <CreateAnnotatorForm lang={lang} />
        </CollapsibleSection>
      </section>
      <section>
        <LazyCollapsibleSection
          title={tk("reviewer_create")}
          load={loadCreateCase}
          loadingLabel={tk("ui_loading")}
          errorLabel={tk("ui_load_failed")}
        >
          {(data) => (
            <CreateCaseForm
              lang={lang}
              annotators={data.annotators}
              guides={data.guides}
              topics={data.topics}
              scopeOptions={scopeOptions}
            />
          )}
        </LazyCollapsibleSection>
      </section>
      <section>
        <LazyCollapsibleSection
          title={tk("reviewer_scope_template_section")}
          load={loadScopeTemplates}
          loadingLabel={tk("ui_loading")}
          errorLabel={tk("ui_load_failed")}
        >
          {(templates) => (
            <ScopeOfWorkTemplateManager lang={lang} templates={templates} scopeOptions={scopeOptions} />
          )}
        </LazyCollapsibleSection>
      </section>
      <section>
        <LazyCollapsibleSection
          title={tk("reviewer_advanced_section")}
          load={loadAdvancedData}
          loadingLabel={tk("ui_loading")}
          errorLabel={tk("ui_load_failed")}
        >
          {(bundle) => <ReviewerAdvancedDataView lang={lang} data={bundle} />}
        </LazyCollapsibleSection>
      </section>
    </>
  );
}
