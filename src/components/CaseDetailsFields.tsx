"use client";

import type { GuideOptionLite, TopicOptionLite } from "@/lib/guide-topic";
import type { DictKey, Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import {
  CaseProjectField,
  CaseRedbrickProjectField,
  CaseScopeOfWorkField,
} from "@/components/CaseProjectScopeFields";

const INPUT =
  "mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2";

export type CaseDetailsFieldsValue = {
  project: string;
  redbrickProject: string;
  guideId: string;
  topicIds: string[];
  guideline: string;
  radiologistFinding: string;
  videoGuideUrls: string;
  scopeOfWork: string;
  minMinutesPerCase: string;
  maxMinutesPerCase: string;
  compensationType: "PER_CASE" | "PER_MINUTE";
  compensationAmount: string;
};

type GuideOption = Pick<GuideOptionLite, "id" | "title">;

/**
 * Shared case detail fields used by create, single edit, and batch edit.
 * Mode-specific fields (case IDs, status, deadline UI, assignment) stay outside.
 */
export function CaseDetailsFields({
  lang,
  idPrefix,
  value,
  onChange,
  guides,
  topics,
  scopeOptions = [],
  projectOptions = [],
  rbProjectOptions = [],
  required = false,
  /** When true, emit native form field names for createCaseAction. */
  formNames = false,
  baseRateHint,
  showBaseRatePlaceholder = false,
  guideHelp,
}: {
  lang: Lang;
  idPrefix: string;
  value: CaseDetailsFieldsValue;
  onChange: (patch: Partial<CaseDetailsFieldsValue>) => void;
  guides: GuideOption[];
  topics: TopicOptionLite[];
  scopeOptions?: string[];
  projectOptions?: string[];
  rbProjectOptions?: string[];
  required?: boolean;
  formNames?: boolean;
  baseRateHint?: string;
  showBaseRatePlaceholder?: boolean;
  guideHelp?: string;
}) {
  const tk = (k: DictKey) => t(lang, k);

  const visibleTopics = topics.filter(
    (topic) =>
      (topic.projects.length === 0 ||
        !value.redbrickProject.trim() ||
        topic.projects.some((p) => p.redbrickProject === value.redbrickProject.trim())) &&
      (topic.scopes.length === 0 ||
        !value.scopeOfWork.trim() ||
        topic.scopes.some((s) => s.scopeOfWork === value.scopeOfWork.trim())),
  );

  function toggleTopic(topicId: string) {
    onChange({
      topicIds: value.topicIds.includes(topicId)
        ? value.topicIds.filter((id) => id !== topicId)
        : [...value.topicIds, topicId],
    });
  }

  return (
    <>
      <CaseProjectField
        lang={lang}
        idPrefix={idPrefix}
        name={formNames ? "project" : undefined}
        required={required}
        value={value.project}
        onChange={(project) => onChange({ project })}
        options={projectOptions}
      />
      <CaseRedbrickProjectField
        lang={lang}
        idPrefix={idPrefix}
        name={formNames ? "redbrickProject" : undefined}
        required={required}
        value={value.redbrickProject}
        onChange={(redbrickProject) => onChange({ redbrickProject })}
        options={rbProjectOptions}
      />
      <label className="md:col-span-2">
        <span className="text-sm text-[var(--muted)]">{tk("case_guide")}</span>
        <select
          name={formNames ? "guideId" : undefined}
          value={value.guideId}
          onChange={(e) => onChange({ guideId: e.target.value })}
          className={INPUT}
        >
          <option value="">—</option>
          {guides.map((guide) => (
            <option key={guide.id} value={guide.id}>
              {guide.title}
            </option>
          ))}
        </select>
        {guideHelp ? <p className="mt-1 text-xs text-[var(--muted)]">{guideHelp}</p> : null}
      </label>
      <div className="md:col-span-2">
        <span className="text-sm text-[var(--muted)]">{tk("case_topic")}</span>
        <p className="mt-0.5 text-xs text-[var(--muted)]">{tk("case_topic_multi_hint")}</p>
        <div className="mt-2 max-h-48 space-y-2 overflow-y-auto rounded-md border border-[var(--border)] bg-[var(--bg)] p-2">
          {visibleTopics.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">—</p>
          ) : (
            visibleTopics.map((topic) => (
              <label key={topic.id} className="flex cursor-pointer items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  name={formNames ? "topicIds" : undefined}
                  value={topic.id}
                  className="mt-1"
                  checked={value.topicIds.includes(topic.id)}
                  onChange={() => toggleTopic(topic.id)}
                />
                <span>{topic.name}</span>
              </label>
            ))
          )}
        </div>
      </div>
      <label className="md:col-span-2">
        <span className="text-sm text-[var(--muted)]">{tk("case_guideline")}</span>
        <textarea
          name={formNames ? "guideline" : undefined}
          rows={3}
          value={value.guideline}
          onChange={(e) => onChange({ guideline: e.target.value })}
          className={INPUT}
        />
      </label>
      <label className="md:col-span-2">
        <span className="text-sm text-[var(--muted)]">{tk("case_radiologist_finding")}</span>
        <textarea
          name={formNames ? "radiologistFinding" : undefined}
          rows={4}
          value={value.radiologistFinding}
          onChange={(e) => onChange({ radiologistFinding: e.target.value })}
          className={INPUT}
          placeholder={tk("case_radiologist_finding_placeholder")}
        />
        <p className="mt-1 text-xs text-[var(--muted)]">{tk("case_radiologist_finding_hint")}</p>
      </label>
      <div className="md:col-span-2">
        <label htmlFor={`${idPrefix}-video-guides`} className="text-sm text-[var(--muted)]">
          {tk("case_videos")}
        </label>
        <textarea
          id={`${idPrefix}-video-guides`}
          name={formNames ? "videoGuideUrls" : undefined}
          rows={3}
          value={value.videoGuideUrls}
          onChange={(e) => onChange({ videoGuideUrls: e.target.value })}
          placeholder="https://..."
          className={`${INPUT} font-mono text-sm`}
        />
        <p className="mt-1 text-xs text-[var(--muted)]">{tk("case_video_guides_hint")}</p>
      </div>
      <CaseScopeOfWorkField
        lang={lang}
        idPrefix={idPrefix}
        name={formNames ? "scopeOfWork" : undefined}
        required={required}
        value={value.scopeOfWork}
        onChange={(scopeOfWork) => onChange({ scopeOfWork })}
        options={scopeOptions}
      />
      <label>
        <span className="text-sm text-[var(--muted)]">{tk("case_minMinutes_recommended")}</span>
        <input
          name={formNames ? "minMinutesPerCase" : undefined}
          type="number"
          min={1}
          required={required}
          value={value.minMinutesPerCase}
          onChange={(e) => onChange({ minMinutesPerCase: e.target.value })}
          className={INPUT}
        />
      </label>
      <label>
        <span className="text-sm text-[var(--muted)]">{tk("case_maxMinutes")}</span>
        <input
          name={formNames ? "maxMinutesPerCase" : undefined}
          type="number"
          min={1}
          required={required}
          value={value.maxMinutesPerCase}
          onChange={(e) => onChange({ maxMinutesPerCase: e.target.value })}
          className={INPUT}
        />
      </label>
      <label>
        <span className="text-sm text-[var(--muted)]">{tk("case_compType")}</span>
        <select
          name={formNames ? "compensationType" : undefined}
          value={value.compensationType}
          onChange={(e) =>
            onChange({ compensationType: e.target.value as "PER_CASE" | "PER_MINUTE" })
          }
          className={INPUT}
        >
          <option value="PER_MINUTE">{tk("comp_per_minute")}</option>
          <option value="PER_CASE">{tk("comp_per_case")}</option>
        </select>
      </label>
      <label>
        <span className="text-sm text-[var(--muted)]">{tk("case_base_rate")}</span>
        <input
          name={formNames ? "compensationAmount" : undefined}
          type="number"
          min={0}
          step="0.01"
          value={value.compensationAmount}
          onChange={(e) => onChange({ compensationAmount: e.target.value })}
          placeholder={showBaseRatePlaceholder ? tk("case_base_rate_placeholder") : undefined}
          className={INPUT}
        />
        {baseRateHint ? (
          <p className="mt-1 text-xs text-[var(--muted)]">{baseRateHint}</p>
        ) : null}
      </label>
    </>
  );
}
