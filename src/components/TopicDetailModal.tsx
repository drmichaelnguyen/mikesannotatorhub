"use client";

import { useEffect, useState } from "react";
import { getTopicDetailAction } from "@/app/actions/cases";
import { LoadingProgressBar } from "@/components/LoadingProgressBar";
import { RichTextContent } from "@/components/RichTextContent";
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
  const [detail, setDetail] = useState<SerializedCaseTopic | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!topic) {
      setDetail(null);
      setLoading(false);
      return;
    }
    if (topic.description?.trim()) {
      setDetail(topic);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getTopicDetailAction(topic.id)
      .then((full) => {
        if (cancelled) return;
        setDetail(
          full
            ? {
                id: full.id,
                name: full.name,
                description: full.description,
                projects: full.projects,
                scopes: full.scopes,
              }
            : topic,
        );
      })
      .catch(() => {
        if (!cancelled) setDetail(topic);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [topic]);

  if (!topic) return null;
  const display = detail ?? topic;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 shadow-xl"
        role="dialog"
        aria-modal
        aria-labelledby="topic-detail-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2 border-b border-[var(--border)] pb-3">
          <h2 id="topic-detail-title" className="text-lg font-semibold text-[var(--text)]">
            {display.name}
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
            {loading ? (
              <div className="mt-2 overflow-hidden rounded-md border border-[var(--border)]">
                <LoadingProgressBar />
                <p className="px-3 py-4 text-sm text-[var(--muted)]">{tk("ui_loading")}</p>
              </div>
            ) : display.description?.trim() ? (
              <RichTextContent lang={lang} html={display.description} className="mt-1" />
            ) : (
              <p className="mt-1 text-[var(--muted)]">—</p>
            )}
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
              {tk("reviewer_topic_projects")}
            </p>
            {display.projects.length === 0 ? (
              <p className="mt-1 text-[var(--muted)]">—</p>
            ) : (
              <ul className="mt-1 list-inside list-disc text-[var(--text)]">
                {display.projects.map((p) => (
                  <li key={p.id}>{p.redbrickProject}</li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
              {tk("case_scope")}
            </p>
            {display.scopes.length === 0 ? (
              <p className="mt-1 text-[var(--muted)]">—</p>
            ) : (
              <ul className="mt-1 list-inside list-disc whitespace-pre-wrap text-[var(--text)]">
                {display.scopes.map((s) => (
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
