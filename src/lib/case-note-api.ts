import type { CaseDiscussionNote } from "@/components/CaseDiscussion";

type NoteListResult =
  | { ok: true; notes: CaseDiscussionNote[]; viewerId: string }
  | { ok: false; error: string };

type NotePostResult =
  | { ok: true }
  | { ok: false; error: string };

type NoteMutationResult =
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

export async function updateCaseNote(input: {
  caseDbId: string;
  noteId: string;
  content: string;
  imageDataList: string[];
}): Promise<NoteMutationResult> {
  const res = await fetch(
    `/api/cases/${encodeURIComponent(input.caseDbId)}/notes/${encodeURIComponent(input.noteId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: input.content,
        imageDataList: input.imageDataList,
      }),
    },
  );
  const data = (await res.json()) as { ok?: boolean; error?: string };
  if (!res.ok || !data.ok) {
    return {
      ok: false as const,
      error: typeof data.error === "string" ? data.error : "unknown",
    };
  }
  return { ok: true as const };
}

export async function deleteCaseNote(input: { caseDbId: string; noteId: string }): Promise<NoteMutationResult> {
  const res = await fetch(
    `/api/cases/${encodeURIComponent(input.caseDbId)}/notes/${encodeURIComponent(input.noteId)}`,
    { method: "DELETE" },
  );
  const data = (await res.json()) as { ok?: boolean; error?: string };
  if (!res.ok || !data.ok) {
    return {
      ok: false as const,
      error: typeof data.error === "string" ? data.error : "unknown",
    };
  }
  return { ok: true as const };
}
