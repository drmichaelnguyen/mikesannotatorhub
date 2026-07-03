"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  createGuideAction,
  createTopicAction,
  deleteGuideAction,
  updateGuideAction,
  updateTopicAction,
} from "@/app/actions/cases";
import { RichTextEditor, type RichTextEditorHandle } from "@/components/RichTextEditor";
import { RichTextContent } from "@/components/RichTextContent";
import type { GuideOption, TopicOption } from "@/lib/guide-topic";
import { hasTemporaryBlobImages } from "@/lib/rich-text-images";
import type { DictKey, Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";

function htmlToPlainText(html: string) {
  if (!html) return "";
  const doc = new DOMParser().parseFromString(html, "text/html");
  return (doc.body.textContent ?? "").replace(/\s+\n/g, "\n").trim();
}

function toggleSelection(current: string[], value: string, checked: boolean) {
  if (checked) {
    if (current.includes(value)) return current;
    return [...current, value];
  }
  return current.filter((item) => item !== value);
}

function topicActionErrorMessage(
  state: { ok: false; error: string } | { ok: true } | null,
  tk: (k: DictKey) => string,
): string | null {
  if (!state || state.ok) return null;
  if (state.error === "blob_images") return tk("rich_text_blob_images_save_blocked");
  return tk("required");
}

function submitWithRichField(
  e: React.FormEvent<HTMLFormElement>,
  fieldName: string,
  html: string,
  action: (fd: FormData) => void,
) {
  e.preventDefault();
  const fd = new FormData(e.currentTarget);
  fd.set(fieldName, html);
  action(fd);
}

function submitWithRichEditor(
  e: React.FormEvent<HTMLFormElement>,
  fieldName: string,
  editorRef: React.RefObject<RichTextEditorHandle | null>,
  fallbackHtml: string,
  action: (fd: FormData) => void,
  onBusy: (message: string) => void,
  busyMessage: string,
) {
  e.preventDefault();
  if (editorRef.current?.isImageBusy()) {
    onBusy(busyMessage);
    return;
  }
  submitWithRichField(e, fieldName, editorRef.current?.getHtml() ?? fallbackHtml, action);
}

export function GuideManager({ lang, guides }: { lang: Lang; guides: GuideOption[] }) {
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
  const [guideTitle, setGuideTitle] = useState("");
  const [guideContent, setGuideContent] = useState("");
  const [editingGuideId, setEditingGuideId] = useState<string | null>(null);
  const [editingGuideTitle, setEditingGuideTitle] = useState("");
  const [editingGuideContent, setEditingGuideContent] = useState("");
  const [expandedGuideIds, setExpandedGuideIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (createGuideState?.ok || updateGuideState?.ok) {
      window.location.reload();
    }
  }, [createGuideState, updateGuideState]);

  function closeGuideEdit() {
    setEditingGuideId(null);
    setEditingGuideTitle("");
    setEditingGuideContent("");
  }

  function startGuideEdit(guide: GuideOption) {
    setEditingGuideId(guide.id);
    setEditingGuideTitle(guide.title);
    setEditingGuideContent(guide.content);
    setExpandedGuideIds((prev) => ({ ...prev, [guide.id]: false }));
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-[var(--muted)]">{tk("reviewer_guide_section_hint")}</p>

      <form
        onSubmit={(e) => submitWithRichField(e, "content", guideContent, guideAction)}
        className="space-y-3 rounded-md border border-[var(--border)] bg-[var(--bg)] p-3"
      >
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

      <div>
        <h3 className="mb-2 text-sm font-medium">{tk("case_guide")}</h3>
        <div className="space-y-2">
          {guides.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">{tk("no_cases")}</p>
          ) : (
            guides.map((guide) => {
              const isEditing = editingGuideId === guide.id;
              const hasContent = htmlToPlainText(guide.content) !== "";
              return (
                <div key={guide.id} className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-medium">{guide.title}</p>
                    <div className="flex shrink-0 gap-2">
                      {!isEditing && hasContent && (
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
                          {expandedGuideIds[guide.id] ? tk("hide_content") : tk("show_content")}
                        </button>
                      )}
                      {!isEditing && (
                        <button
                          type="button"
                          className="rounded-md border border-[var(--border)] px-2 py-1 text-xs hover:border-[var(--accent)]"
                          onClick={() => startGuideEdit(guide)}
                        >
                          {tk("edit")}
                        </button>
                      )}
                      {!isEditing && (
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
                      )}
                    </div>
                  </div>

                  {!isEditing && hasContent && expandedGuideIds[guide.id] && (
                    <div className="mt-2 rounded-md border border-[var(--border)] bg-[var(--surface)] p-3">
                      <RichTextContent lang={lang} html={guide.content} />
                    </div>
                  )}

                  {isEditing && (
                    <form
                      key={guide.id}
                      onSubmit={(e) =>
                        submitWithRichField(e, "content", editingGuideContent, updateGuideActionState)
                      }
                      className="mt-3 space-y-3 rounded-md border border-[var(--border)] bg-[var(--surface)] p-3"
                    >
                      <h4 className="text-sm font-medium">{tk("reviewer_guide_edit")}</h4>
                      <input type="hidden" name="guideId" value={editingGuideId} />
                      <label className="block text-sm">
                        <span className="text-[var(--muted)]">{tk("reviewer_guide_title")}</span>
                        <input
                          name="title"
                          required
                          value={editingGuideTitle}
                          onChange={(e) => setEditingGuideTitle(e.target.value)}
                          className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
                        />
                      </label>
                      <div className="block text-sm">
                        <label htmlFor={`guide-content-edit-${guide.id}`} className="text-[var(--muted)]">
                          {tk("reviewer_guide_content")}
                        </label>
                        <RichTextEditor
                          id={`guide-content-edit-${guide.id}`}
                          value={editingGuideContent}
                          onChange={setEditingGuideContent}
                          placeholder={tk("reviewer_guide_content")}
                        />
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
                          onClick={closeGuideEdit}
                        >
                          {tk("drawer_close")}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

export function TopicManager({
  lang,
  topics,
  scopeOptions,
  rbProjectOptions,
}: {
  lang: Lang;
  topics: TopicOption[];
  scopeOptions: string[];
  rbProjectOptions: string[];
}) {
  const tk = (k: DictKey) => t(lang, k);
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
  const [topicName, setTopicName] = useState("");
  const [topicDescription, setTopicDescription] = useState("");
  const [topicProjectSelections, setTopicProjectSelections] = useState<string[]>([]);
  const [topicScopeSelections, setTopicScopeSelections] = useState<string[]>([]);
  const [editingTopicId, setEditingTopicId] = useState<string | null>(null);
  const [editingTopicName, setEditingTopicName] = useState("");
  const [editingTopicDescription, setEditingTopicDescription] = useState("");
  const [editingTopicProjectsInitial, setEditingTopicProjectsInitial] = useState<string[]>([]);
  const [editingTopicScopesInitial, setEditingTopicScopesInitial] = useState<string[]>([]);
  const [expandedTopicIds, setExpandedTopicIds] = useState<Record<string, boolean>>({});
  const [topicSubmitNotice, setTopicSubmitNotice] = useState<string | null>(null);
  const createTopicEditorRef = useRef<RichTextEditorHandle>(null);
  const editTopicEditorRef = useRef<RichTextEditorHandle>(null);

  useEffect(() => {
    if (topicState?.ok || updateTopicState?.ok) {
      window.location.reload();
    }
  }, [topicState, updateTopicState]);

  function closeTopicEdit() {
    setEditingTopicId(null);
    setEditingTopicName("");
    setEditingTopicDescription("");
    setEditingTopicProjectsInitial([]);
    setEditingTopicScopesInitial([]);
  }

  function startTopicEdit(topic: TopicOption) {
    setEditingTopicId(topic.id);
    setEditingTopicName(topic.name);
    setEditingTopicDescription(topic.description ?? "");
    setEditingTopicProjectsInitial(topic.projects.map((p) => p.redbrickProject));
    setEditingTopicScopesInitial(topic.scopes.map((s) => s.scopeOfWork));
    setExpandedTopicIds((prev) => ({ ...prev, [topic.id]: false }));
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-[var(--muted)]">{tk("reviewer_topic_section_hint")}</p>

      <form
        onSubmit={(e) =>
          submitWithRichEditor(
            e,
            "description",
            createTopicEditorRef,
            topicDescription,
            topicAction,
            setTopicSubmitNotice,
            tk("rich_text_image_still_embedding"),
          )
        }
        className="space-y-3 rounded-md border border-[var(--border)] bg-[var(--bg)] p-3"
      >
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
            ref={createTopicEditorRef}
            id="topic-desc-create"
            value={topicDescription}
            onChange={setTopicDescription}
            placeholder={tk("reviewer_topic_desc")}
          />
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
        {topicSubmitNotice && <p className="text-sm text-[var(--danger)]">{topicSubmitNotice}</p>}
        {topicActionErrorMessage(topicState, tk) && (
          <p className="text-sm text-[var(--danger)]">{topicActionErrorMessage(topicState, tk)}</p>
        )}
        <button
          type="submit"
          disabled={topicPending}
          className="rounded-md bg-[var(--accent)] px-3 py-2 text-sm text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
        >
          {tk("reviewer_topic_create")}
        </button>
      </form>

      <div>
        <h3 className="mb-2 text-sm font-medium">{tk("case_topic")}</h3>
        <div className="space-y-2">
          {topics.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">{tk("no_cases")}</p>
          ) : (
            topics.map((topic) => {
              const isEditing = editingTopicId === topic.id;
              const hasDescription =
                topic.description != null && htmlToPlainText(topic.description) !== "";
              return (
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
                    {!isEditing && (
                      <div className="flex shrink-0 gap-2">
                        {hasDescription && (
                          <button
                            type="button"
                            className="rounded-md border border-[var(--border)] px-2 py-1 text-xs hover:border-[var(--accent)]"
                            onClick={() =>
                              setExpandedTopicIds((prev) => ({
                                ...prev,
                                [topic.id]: !prev[topic.id],
                              }))
                            }
                          >
                            {expandedTopicIds[topic.id] ? tk("hide_content") : tk("show_content")}
                          </button>
                        )}
                        <button
                          type="button"
                          className="rounded-md border border-[var(--border)] px-2 py-1 text-xs hover:border-[var(--accent)]"
                          onClick={() => startTopicEdit(topic)}
                        >
                          {tk("edit")}
                        </button>
                      </div>
                    )}
                  </div>

                  {!isEditing && hasDescription && expandedTopicIds[topic.id] && (
                    <div className="mt-2 rounded-md border border-[var(--border)] bg-[var(--surface)] p-3">
                      <RichTextContent lang={lang} html={topic.description!} />
                    </div>
                  )}

                  {isEditing && (
                    <form
                      key={topic.id}
                      onSubmit={(e) =>
                        submitWithRichEditor(
                          e,
                          "description",
                          editTopicEditorRef,
                          editingTopicDescription,
                          updateTopicActionState,
                          setTopicSubmitNotice,
                          tk("rich_text_image_still_embedding"),
                        )
                      }
                      className="mt-3 space-y-3 rounded-md border border-[var(--border)] bg-[var(--surface)] p-3"
                    >
                      <h4 className="text-sm font-medium">{tk("reviewer_topic_edit")}</h4>
                      <input type="hidden" name="topicId" value={editingTopicId} />
                      <label className="block text-sm">
                        <span className="text-[var(--muted)]">{tk("reviewer_topic_name")}</span>
                        <input
                          name="name"
                          required
                          value={editingTopicName}
                          onChange={(e) => setEditingTopicName(e.target.value)}
                          className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
                        />
                      </label>
                      {hasTemporaryBlobImages(editingTopicDescription) && (
                        <p className="text-sm text-[var(--danger)]">{tk("rich_text_blob_images_edit_hint")}</p>
                      )}
                      <div className="block text-sm">
                        <label htmlFor={`topic-desc-edit-${topic.id}`} className="text-[var(--muted)]">
                          {tk("reviewer_topic_desc")}
                        </label>
                        <RichTextEditor
                          ref={editTopicEditorRef}
                          id={`topic-desc-edit-${topic.id}`}
                          value={editingTopicDescription}
                          onChange={setEditingTopicDescription}
                          placeholder={tk("reviewer_topic_desc")}
                        />
                      </div>
                      <label className="block text-sm">
                        <span className="text-[var(--muted)]">{tk("reviewer_topic_projects")}</span>
                        <p className="text-xs text-[var(--muted)]">{tk("reviewer_topic_projects_hint")}</p>
                        <div className="mt-1 max-h-40 space-y-1 overflow-auto rounded-md border border-[var(--border)] bg-[var(--bg)] p-2">
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
                        <div className="mt-1 max-h-40 space-y-1 overflow-auto rounded-md border border-[var(--border)] bg-[var(--bg)] p-2">
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
                      {topicSubmitNotice && (
                        <p className="text-sm text-[var(--danger)]">{topicSubmitNotice}</p>
                      )}
                      {topicActionErrorMessage(updateTopicState, tk) && (
                        <p className="text-sm text-[var(--danger)]">
                          {topicActionErrorMessage(updateTopicState, tk)}
                        </p>
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
                          onClick={closeTopicEdit}
                        >
                          {tk("drawer_close")}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
