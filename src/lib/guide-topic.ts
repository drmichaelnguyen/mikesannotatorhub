export type GuideOption = {
  id: string;
  title: string;
  content: string;
};

export type TopicOption = {
  id: string;
  name: string;
  description: string | null;
  projects: { id: string; redbrickProject: string }[];
  scopes: { id: string; scopeOfWork: string }[];
};

export type MentionOption = {
  id: string;
  label: string;
  kind: "guide" | "topic";
  hint: string;
};

export function buildMentionOptionsForCase(
  guides: GuideOption[],
  topics: TopicOption[],
  context?: { redbrickProject: string; scopeOfWork: string },
): MentionOption[] {
  const guideOptions = guides.map((guide) => ({
    id: guide.id,
    label: `Guide: ${guide.title}`,
    kind: "guide" as const,
    hint: "global",
  }));
  const normalizedProject = context?.redbrickProject.trim() ?? "";
  const normalizedScope = context?.scopeOfWork.trim() ?? "";
  const topicOptions = topics
    .filter((topic) => {
      const matchesProject =
        topic.projects.length === 0 ||
        !normalizedProject ||
        topic.projects.some((p) => p.redbrickProject === normalizedProject);
      const matchesScope =
        topic.scopes.length === 0 ||
        !normalizedScope ||
        topic.scopes.some((s) => s.scopeOfWork === normalizedScope);
      return matchesProject && matchesScope;
    })
    .map((topic) => ({
    id: topic.id,
    label: `Topic: ${topic.name}`,
    kind: "topic" as const,
    hint:
      topic.projects.length || topic.scopes.length
        ? [
            topic.projects.length ? `projects: ${topic.projects.map((p) => p.redbrickProject).join(", ")}` : "",
            topic.scopes.length ? `scopes: ${topic.scopes.map((s) => s.scopeOfWork).join(", ")}` : "",
          ]
            .filter(Boolean)
            .join(" | ")
        : "global",
  }));
  return [...guideOptions, ...topicOptions].sort((a, b) => a.label.localeCompare(b.label));
}
