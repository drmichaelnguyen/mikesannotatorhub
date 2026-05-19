"use client";

import { useActionState, useEffect, useState } from "react";
import {
  createGuideAction,
  createTopicAction,
  deleteGuideAction,
  updateGuideAction,
  updateTopicAction,
} from "@/app/actions/cases";
import { RichTextEditor } from "@/components/RichTextEditor";
import { RichTextContent } from "@/components/RichTextContent";
import type { GuideOption, TopicOption } from "@/lib/guide-topic";
import type { DictKey, Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";

function htmlToPlainText(html: string) {
  if (!html) return "";
  const doc = new DOMParser().parseFromString(html, "text/html");
  return (doc.body.textContent ?? "").replace(/\s+\n/g, "\n").trim();
}

export function GuideTopicManager({
  lang,
  guides,
  topics,
  scopeOptions,
  rbProjectOptions,
}: {
  lang: Lang;
  guides: GuideOption[];
  topics: TopicOption[];
  scopeOptions: string[];
  rbProjectOptions: string[];
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
  const [updateTopicState, updateTopicActionState, updateTopicPending] = useActionState(
    async (_: Awaited<ReturnType<typeof updateTopicAction>> | null, fd: FormData) => {
      return updateTopicAction(fd);
    },
    null as Awaited<ReturnType<typeof updateTopicAction>> | null,
  );
  const [guideTitle, setGuideTitle] = useState("");
  const [guideContent, setGuideContent] = useState("");
  const [topicName, setTopicName] = useState("");
  const [topicDescription, setTopicDescription] = useState("");
  const [topicProjectSelections, setTopicProjectSelections] = useState<string[]>([]);
  const [topicScopeSelections, setTopicScopeSelections] = useState<string[]>([]);
  const [editingGuideId, setEditingGuideId] = useState<string | null>(null);
  const [editingGuideTitle, setEditingGuideTitle] = useState("");
  const [editingGuideContent, setEditingGuideContent] = useState("");
  const [editingTopicId, setEditingTopicId] = useState<string | null>(null);
  const [editingTopicName, setEditingTopicName] = useState("");
  const [editingTopicDescription, setEditingTopicDescription] = useState("");
  const [editingTopicProjectsInitial, setEditingTopicProjectsInitial] = useState<string[]>([]);
  const [editingTopicScopesInitial, setEditingTopicScopesInitial] = useState<string[]>([]);
  const [expandedGuideIds, setExpandedGuideIds] = useState<Record<string, boolean>>({});

  function toggleSelection(current: string[], value: string, checked: boolean) {
    if (checked) {
      if (current.includes(value)) return current;
      return [...current, value];
    }
    return current.filter((item) => item !== value);
  }

  useEffect(() => {
    if (
      createGuideState?.ok ||
      updateGuideState?.ok ||
      topicState?.ok ||
      updateTopicState?.ok
    ) {
      window.location.reload();
    }
  }, [createGuideState, updateGuideState, topicState, updateTopicState]);

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
            <div className="block text-sm">
              <label htmlFor="guide-content-create" className="text-[var(--muted)]">
                {tk("reviewer_guide_content")}
              </label>
              <RichTextEditor
                id="guide-content-create"
                value={guideContent}
                onChange={setGuideContent}
                placeholder={tk("reviewer_guide_content")}
              />
              <input type="hidden" name="content" value={guideContent} />
            </div>
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
              <div className="block text-sm">
                <label htmlFor="guide-content-edit" className="text-[var(--muted)]">
                  {tk("reviewer_guide_content")}
                </label>
                <RichTextEditor
                  id="guide-content-edit"
                  value={editingGuideContent}
                  onChange={setEditingGuideContent}
                  placeholder={tk("reviewer_guide_content")}
                />
                <input type="hidden" name="content" value={editingGuideContent} />
              </div>
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
            <input
              name="name"
              required
              value={topicName}
              onChange={(e) => setTopicName(e.target.value)}
              className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
            />
          </label>
          <div className="block text-sm">
            <label htmlFor="topic-desc-create" className="text-[var(--muted)]">
              {tk("reviewer_topic_desc")}
            </label>
            <RichTextEditor
              id="topic-desc-create"
              value={topicDescription}
              onChange={setTopicDescription}
              placeholder={tk("reviewer_topic_desc")}
            />
            <input type="hidden" name="description" value={topicDescription} />
          </div>
          <label className="block text-sm">
            <span className="text-[var(--muted)]">{tk("reviewer_topic_projects")}</span>
            <p className="text-xs text-[var(--muted)]">{tk("reviewer_topic_projects_hint")}</p>
            <div className="mt-1 max-h-40 space-y-1 overflow-auto rounded-md border border-[var(--border)] bg-[var(--surface)] p-2">
              {rbProjectOptions.map((project) => (
                <label key={project} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="projects"
                    value={project}
                    checked={topicProjectSelections.includes(project)}
                    onChange={(e) =>
                      setTopicProjectSelections((prev) =>
                        toggleSelection(prev, project, e.target.checked),
                      )
                    }
                  />
                  <span>{project}</span>
                </label>
              ))}
            </div>
          </label>
          <label className="block text-sm">
            <span className="text-[var(--muted)]">{tk("case_scope")}</span>
            <p className="text-xs text-[var(--muted)]">{tk("reviewer_topic_scope_hint")}</p>
            <div className="mt-1 max-h-40 space-y-1 overflow-auto rounded-md border border-[var(--border)] bg-[var(--surface)] p-2">
              {scopeOptions.map((scope) => (
                <label key={scope} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="scopes"
                    value={scope}
                    checked={topicScopeSelections.includes(scope)}
                    onChange={(e) =>
                      setTopicScopeSelections((prev) =>
                        toggleSelection(prev, scope, e.target.checked),
                      )
                    }
                  />
                  <span>{scope}</span>
                </label>
              ))}
            </div>
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
                      <button
                        type="button"
                        className="rounded-md border border-[var(--border)] px-2 py-1 text-xs hover:border-[var(--accent)]"
                        onClick={() =>
                          setExpandedGuideIds((prev) => ({
                            ...prev,
                            [guide.id]: !prev[guide.id],
                          }))
                        }
                      >
                        {expandedGuideIds[guide.id] ? "Hide content" : "Show content"}
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
                  {expandedGuideIds[guide.id] && (
                    <div className="mt-2 rounded-md border border-[var(--border)] bg-[var(--surface)] p-3">
                      <RichTextContent html={guide.content} />
                    </div>
                  )}
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
                        {[
                          topic.projects.length
                            ? `RB: ${topic.projects.map((p) => p.redbrickProject).join(", ")}`
                            : "",
                          topic.scopes.length
                            ? `Scope: ${topic.scopes.map((s) => s.scopeOfWork).join(", ")}`
                            : "",
                        ]
                          .filter(Boolean)
                          .join(" | ") || "global"}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="rounded-md border border-[var(--border)] px-2 py-1 text-xs hover:border-[var(--accent)]"
                      onClick={() => {
                        setEditingTopicId(topic.id);
                        setEditingTopicName(topic.name);
                        setEditingTopicDescription(topic.description ?? "");
                        setEditingTopicProjectsInitial(
                          topic.projects.map((p) => p.redbrickProject),
                        );
                        setEditingTopicScopesInitial(topic.scopes.map((s) => s.scopeOfWork));
                      }}
                    >
                      {tk("edit")}
                    </button>
                  </div>
                  {topic.description && htmlToPlainText(topic.description) !== "" && (
                    <div className="mt-2 rounded-md border border-[var(--border)] bg-[var(--surface)] p-3">
                      <RichTextContent html={topic.description} />
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {editingTopicId && (
        <form
          key={editingTopicId}
          action={updateTopicActionState}
          className="space-y-3 rounded-md border border-[var(--border)] bg-[var(--bg)] p-3"
        >
          <h3 className="text-sm font-medium">{tk("reviewer_topic_edit")}</h3>
          <input type="hidden" name="topicId" value={editingTopicId} />
          <label className="block text-sm">
            <span className="text-[var(--muted)]">{tk("reviewer_topic_name")}</span>
            <input
              name="name"
              required
              value={editingTopicName}
              onChange={(e) => setEditingTopicName(e.target.value)}
              className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
            />
          </label>
          <div className="block text-sm">
            <label htmlFor="topic-desc-edit" className="text-[var(--muted)]">
              {tk("reviewer_topic_desc")}
            </label>
            <RichTextEditor
              id="topic-desc-edit"
              value={editingTopicDescription}
              onChange={setEditingTopicDescription}
              placeholder={tk("reviewer_topic_desc")}
            />
            <input type="hidden" name="description" value={editingTopicDescription} />
          </div>
          <label className="block text-sm">
            <span className="text-[var(--muted)]">{tk("reviewer_topic_projects")}</span>
            <p className="text-xs text-[var(--muted)]">{tk("reviewer_topic_projects_hint")}</p>
            <div className="mt-1 max-h-40 space-y-1 overflow-auto rounded-md border border-[var(--border)] bg-[var(--surface)] p-2">
              {rbProjectOptions.map((project) => (
                <label key={project} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="projects"
                    value={project}
                    checked={editingTopicProjectsInitial.includes(project)}
                    onChange={(e) =>
                      setEditingTopicProjectsInitial((prev) =>
                        toggleSelection(prev, project, e.target.checked),
                      )
                    }
                  />
                  <span>{project}</span>
                </label>
              ))}
            </div>
          </label>
          <label className="block text-sm">
            <span className="text-[var(--muted)]">{tk("case_scope")}</span>
            <p className="text-xs text-[var(--muted)]">{tk("reviewer_topic_scope_hint")}</p>
            <div className="mt-1 max-h-40 space-y-1 overflow-auto rounded-md border border-[var(--border)] bg-[var(--surface)] p-2">
              {scopeOptions.map((scope) => (
                <label key={scope} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="scopes"
                    value={scope}
                    checked={editingTopicScopesInitial.includes(scope)}
                    onChange={(e) =>
                      setEditingTopicScopesInitial((prev) =>
                        toggleSelection(prev, scope, e.target.checked),
                      )
                    }
                  />
                  <span>{scope}</span>
                </label>
              ))}
            </div>
          </label>
          {updateTopicState && !updateTopicState.ok && (
            <p className="text-sm text-[var(--danger)]">{tk("required")}</p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={updateTopicPending}
              className="rounded-md bg-[var(--accent)] px-3 py-2 text-sm text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
            >
              {tk("reviewer_case_save")}
            </button>
            <button
              type="button"
              className="rounded-md border border-[var(--border)] px-3 py-2 text-sm hover:border-[var(--accent)]"
              onClick={() => {
                setEditingTopicId(null);
                setEditingTopicName("");
                setEditingTopicDescription("");
                setEditingTopicProjectsInitial([]);
                setEditingTopicScopesInitial([]);
              }}
            >
              {tk("drawer_close")}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
