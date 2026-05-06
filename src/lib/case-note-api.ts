import type { CaseDiscussionNote } from "@/components/CaseDiscussion";

type NoteListResult =
  | { ok: true; notes: CaseDiscussionNote[] }
  | { ok: false; error: string };

type NotePostResult =
  | { ok: true }
  | { ok: false; error: string };

export async function fetchCaseNotes(caseDbId: string): Promise<NoteListResult> {
  const res = await fetch(`/api/cases/${encodeURIComponent(caseDbId)}/notes`, {
    method: "GET",
    cache: "no-store",
  });
  return (await res.json()) as NoteListResult;
}

export async function createCaseNote(input: {
  caseDbId: string;
  content: string;
  imageDataList: string[];
  parentNoteId?: string | null;
}): Promise<NotePostResult> {
  const res = await fetch(`/api/cases/${encodeURIComponent(input.caseDbId)}/notes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content: input.content,
      imageDataList: input.imageDataList,
      parentNoteId: input.parentNoteId ?? null,
    }),
  });
  return (await res.json()) as NotePostResult;
}
