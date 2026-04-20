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
};

export type MentionOption = {
  id: string;
  label: string;
  kind: "guide" | "topic";
  hint: string;
};

export function buildMentionOptionsForProject(
  guides: GuideOption[],
  topics: TopicOption[],
): MentionOption[] {
  const guideOptions = guides.map((guide) => ({
    id: guide.id,
    label: `Guide: ${guide.title}`,
    kind: "guide" as const,
    hint: "global",
  }));
  const topicOptions = topics.map((topic) => ({
    id: topic.id,
    label: `Topic: ${topic.name}`,
    kind: "topic" as const,
    hint: topic.projects.length
      ? topic.projects.map((p) => p.redbrickProject).join(", ")
      : "global",
  }));
  return [...guideOptions, ...topicOptions].sort((a, b) => a.label.localeCompare(b.label));
}
