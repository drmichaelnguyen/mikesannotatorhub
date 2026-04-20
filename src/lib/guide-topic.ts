export type GuideOption = {
  id: string;
  redbrickProject: string;
  title: string;
  content: string;
};

export type TopicOption = {
  id: string;
  name: string;
  description: string | null;
  projects: { id: string; redbrickProject: string }[];
};

export type MentionOption = {
  id: string;
  label: string;
  kind: "guide" | "topic";
  hint: string;
};

export function buildMentionOptionsForProject(
  project: string,
  guides: GuideOption[],
  topics: TopicOption[],
): MentionOption[] {
  const normalized = (project || "").trim();
  const guideOptions = guides
    .filter((guide) => guide.redbrickProject === normalized)
    .map((guide) => ({
      id: guide.id,
      label: `Guide: ${guide.title}`,
      kind: "guide" as const,
      hint: guide.redbrickProject,
    }));
  const topicOptions = topics
    .filter((topic) => topic.projects.length === 0 || topic.projects.some((p) => p.redbrickProject === normalized))
    .map((topic) => ({
      id: topic.id,
      label: `Topic: ${topic.name}`,
      kind: "topic" as const,
      hint: topic.projects.length
        ? topic.projects.map((p) => p.redbrickProject).join(", ")
        : "global",
    }));
  return [...guideOptions, ...topicOptions].sort((a, b) => a.label.localeCompare(b.label));
}

