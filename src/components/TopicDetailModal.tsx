"use client";

import type { SerializedCaseTopic } from "@/lib/reviewer-serialize";
import type { DictKey, Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";

export function TopicDetailModal({
  lang,
  topic,
  onClose,
}: {
  lang: Lang;
  topic: SerializedCaseTopic | null;
  onClose: () => void;
}) {
  const tk = (k: DictKey) => t(lang, k);
  if (!topic) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 shadow-xl"
        role="dialog"
        aria-modal
        aria-labelledby="topic-detail-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2 border-b border-[var(--border)] pb-3">
          <h2 id="topic-detail-title" className="text-lg font-semibold text-[var(--text)]">
            {topic.name}
          </h2>
          <button
            type="button"
            className="shrink-0 rounded px-2 py-1 text-sm text-[var(--muted)] hover:bg-[var(--bg)] hover:text-[var(--text)]"
            onClick={onClose}
          >
            {tk("drawer_close")}
          </button>
        </div>
        <div className="mt-3 space-y-4 text-sm">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
              {tk("reviewer_topic_desc")}
            </p>
            <p className="mt-1 whitespace-pre-wrap text-[var(--text)]">
              {topic.description?.trim() ? topic.description : "—"}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
              {tk("reviewer_topic_projects")}
            </p>
            {topic.projects.length === 0 ? (
              <p className="mt-1 text-[var(--muted)]">—</p>
            ) : (
              <ul className="mt-1 list-inside list-disc text-[var(--text)]">
                {topic.projects.map((p) => (
                  <li key={p.id}>{p.redbrickProject}</li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
              {tk("case_scope")}
            </p>
            {topic.scopes.length === 0 ? (
              <p className="mt-1 text-[var(--muted)]">—</p>
            ) : (
              <ul className="mt-1 list-inside list-disc whitespace-pre-wrap text-[var(--text)]">
                {topic.scopes.map((s) => (
                  <li key={s.id}>{s.scopeOfWork}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
