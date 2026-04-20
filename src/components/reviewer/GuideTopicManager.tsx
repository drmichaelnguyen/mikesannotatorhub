"use client";

import { useActionState, useEffect, useState } from "react";
import {
  createGuideAction,
  createTopicAction,
  deleteGuideAction,
  updateGuideAction,
} from "@/app/actions/cases";
import { RichTextEditor } from "@/components/RichTextEditor";
import { RichTextContent } from "@/components/RichTextContent";
import type { GuideOption, TopicOption } from "@/lib/guide-topic";
import type { DictKey, Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";

export function GuideTopicManager({
  lang,
  guides,
  topics,
}: {
  lang: Lang;
  guides: GuideOption[];
  topics: TopicOption[];
}) {
  const tk = (k: DictKey) => t(lang, k);
  const [createGuideState, guideAction, guidePending] = useActionState(
    async (_: Awaited<ReturnType<typeof createGuideAction>> | null, fd: FormData) => {
      return createGuideAction(fd);
    },
    null as Awaited<ReturnType<typeof createGuideAction>> | null,
  );
  const [updateGuideState, updateGuideActionState, updateGuidePending] = useActionState(
    async (_: Awaited<ReturnType<typeof updateGuideAction>> | null, fd: FormData) => {
      return updateGuideAction(fd);
    },
    null as Awaited<ReturnType<typeof updateGuideAction>> | null,
  );
  const [topicState, topicAction, topicPending] = useActionState(
    async (_: Awaited<ReturnType<typeof createTopicAction>> | null, fd: FormData) => {
      return createTopicAction(fd);
    },
    null as Awaited<ReturnType<typeof createTopicAction>> | null,
  );
  const [guideTitle, setGuideTitle] = useState("");
  const [guideContent, setGuideContent] = useState("");
  const [editingGuideId, setEditingGuideId] = useState<string | null>(null);
  const [editingGuideTitle, setEditingGuideTitle] = useState("");
  const [editingGuideContent, setEditingGuideContent] = useState("");

  useEffect(() => {
    if (createGuideState?.ok || updateGuideState?.ok || topicState?.ok) {
      window.location.reload();
    }
  }, [createGuideState, updateGuideState, topicState]);

  return (
    <section className="space-y-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      <div>
        <h2 className="text-lg font-medium">{tk("reviewer_guide_section")}</h2>
        <p className="text-xs text-[var(--muted)]">{tk("reviewer_guide_section_hint")}</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <form action={guideAction} className="space-y-3 rounded-md border border-[var(--border)] bg-[var(--bg)] p-3">
            <h3 className="text-sm font-medium">{tk("reviewer_guide_create")}</h3>
            <label className="block text-sm">
              <span className="text-[var(--muted)]">{tk("reviewer_guide_title")}</span>
              <input
                name="title"
                required
                value={guideTitle}
                onChange={(e) => setGuideTitle(e.target.value)}
                className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="text-[var(--muted)]">{tk("reviewer_guide_content")}</span>
              <RichTextEditor
                value={guideContent}
                onChange={setGuideContent}
                placeholder={tk("reviewer_guide_content")}
              />
              <input type="hidden" name="content" value={guideContent} />
            </label>
            {createGuideState && !createGuideState.ok && (
              <p className="text-sm text-[var(--danger)]">{tk("required")}</p>
            )}
            <button
              type="submit"
              disabled={guidePending}
              className="rounded-md bg-[var(--accent)] px-3 py-2 text-sm text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
            >
              {tk("reviewer_guide_create")}
            </button>
          </form>

          {editingGuideId && (
            <form action={updateGuideActionState} className="space-y-3 rounded-md border border-[var(--border)] bg-[var(--bg)] p-3">
              <h3 className="text-sm font-medium">{tk("reviewer_guide_edit")}</h3>
              <input type="hidden" name="guideId" value={editingGuideId} />
              <label className="block text-sm">
                <span className="text-[var(--muted)]">{tk("reviewer_guide_title")}</span>
                <input
                  name="title"
                  required
                  value={editingGuideTitle}
                  onChange={(e) => setEditingGuideTitle(e.target.value)}
                  className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
                />
              </label>
              <label className="block text-sm">
                <span className="text-[var(--muted)]">{tk("reviewer_guide_content")}</span>
                <RichTextEditor
                  value={editingGuideContent}
                  onChange={setEditingGuideContent}
                  placeholder={tk("reviewer_guide_content")}
                />
                <input type="hidden" name="content" value={editingGuideContent} />
              </label>
              {updateGuideState && !updateGuideState.ok && (
                <p className="text-sm text-[var(--danger)]">{tk("required")}</p>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={updateGuidePending}
                  className="rounded-md bg-[var(--accent)] px-3 py-2 text-sm text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
                >
                  {tk("reviewer_case_save")}
                </button>
                <button
                  type="button"
                  className="rounded-md border border-[var(--border)] px-3 py-2 text-sm hover:border-[var(--accent)]"
                  onClick={() => {
                    setEditingGuideId(null);
                    setEditingGuideTitle("");
                    setEditingGuideContent("");
                  }}
                >
                  {tk("drawer_close")}
                </button>
              </div>
            </form>
          )}
        </div>

        <form action={topicAction} className="space-y-3 rounded-md border border-[var(--border)] bg-[var(--bg)] p-3">
          <h3 className="text-sm font-medium">{tk("reviewer_topic_create")}</h3>
          <label className="block text-sm">
            <span className="text-[var(--muted)]">{tk("reviewer_topic_name")}</span>
            <input name="name" required className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2" />
          </label>
          <label className="block text-sm">
            <span className="text-[var(--muted)]">{tk("reviewer_topic_desc")}</span>
            <textarea name="description" rows={3} className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2" />
          </label>
          <label className="block text-sm">
            <span className="text-[var(--muted)]">{tk("reviewer_topic_projects")}</span>
            <p className="text-xs text-[var(--muted)]">{tk("reviewer_topic_projects_hint")}</p>
            <textarea name="projects" rows={3} className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2" />
          </label>
          {topicState && !topicState.ok && <p className="text-sm text-[var(--danger)]">{tk("required")}</p>}
          <button
            type="submit"
            disabled={topicPending}
            className="rounded-md bg-[var(--accent)] px-3 py-2 text-sm text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
          >
            {tk("reviewer_topic_create")}
          </button>
        </form>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-medium">{tk("case_guide")}</h3>
          <div className="space-y-2">
            {guides.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">{tk("no_cases")}</p>
            ) : (
              guides.map((guide) => (
                <div key={guide.id} className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{guide.title}</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="rounded-md border border-[var(--border)] px-2 py-1 text-xs hover:border-[var(--accent)]"
                        onClick={() => {
                          setEditingGuideId(guide.id);
                          setEditingGuideTitle(guide.title);
                          setEditingGuideContent(guide.content);
                        }}
                      >
                        {tk("edit")}
                      </button>
                      <form
                        action={async (fd) => {
                          await deleteGuideAction(fd);
                        }}
                        onSubmit={(e) => {
                          if (!window.confirm(tk("delete_confirm"))) {
                            e.preventDefault();
                          }
                        }}
                      >
                        <input type="hidden" name="guideId" value={guide.id} />
                        <button
                          type="submit"
                          className="rounded-md border border-[var(--danger)] px-2 py-1 text-xs text-[var(--danger)] hover:bg-[var(--danger)]/10"
                        >
                          {tk("delete")}
                        </button>
                      </form>
                    </div>
                  </div>
                  <div className="mt-2 rounded-md border border-[var(--border)] bg-[var(--surface)] p-3">
                    <RichTextContent html={guide.content} />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-medium">{tk("case_topic")}</h3>
          <div className="space-y-2">
            {topics.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">{tk("no_cases")}</p>
            ) : (
              topics.map((topic) => (
                <div key={topic.id} className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{topic.name}</p>
                      <p className="text-xs text-[var(--muted)]">
                        {topic.projects.map((p) => p.redbrickProject).join(", ") || "global"}
                      </p>
                    </div>
                  </div>
                  {topic.description && <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--muted)]">{topic.description}</p>}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
