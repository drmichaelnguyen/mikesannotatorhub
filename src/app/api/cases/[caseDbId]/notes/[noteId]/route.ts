import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false as const, error }, { status });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ caseDbId: string; noteId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return jsonError(401, "auth");

  const { caseDbId, noteId } = await context.params;

  const row = await prisma.annotationCase.findUnique({
    where: { id: caseDbId },
    select: { id: true, annotatorId: true, isReference: true },
  });
  if (!row) return jsonError(404, "notfound");

  if (user.role === "ANNOTATOR") {
    if (!row.isReference && row.annotatorId !== user.id) return jsonError(403, "forbidden");
  } else if (user.role !== "REVIEWER") {
    return jsonError(403, "forbidden");
  }

  const note = await prisma.caseNote.findUnique({
    where: { id: noteId },
    select: { id: true, annotationCaseId: true, authorId: true },
  });
  if (!note || note.annotationCaseId !== caseDbId) return jsonError(404, "notfound");
  if (note.authorId !== user.id) return jsonError(403, "forbidden");

  const body = (await request.json().catch(() => null)) as
    | {
        content?: unknown;
        imageDataList?: unknown;
        isQuestion?: unknown;
      }
    | null;

  const text = typeof body?.content === "string" ? body.content.trim() : "";
  const images = Array.isArray(body?.imageDataList)
    ? body.imageDataList
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

  if (!text && images.length === 0) {
    return jsonError(400, "empty");
  }

  const isQuestion =
    typeof body?.isQuestion === "boolean" ? body.isQuestion : undefined;

  await prisma.caseNote.update({
    where: { id: noteId },
    data: {
      content: text || null,
      imageData: images[0] ?? null,
      imageDataListJson: images.length > 0 ? JSON.stringify(images) : null,
      ...(isQuestion !== undefined ? { isQuestion } : {}),
    },
  });

  revalidatePath("/reviewer");
  revalidatePath("/annotator");
  return NextResponse.json({ ok: true as const });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ caseDbId: string; noteId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return jsonError(401, "auth");

  const { caseDbId, noteId } = await context.params;

  const row = await prisma.annotationCase.findUnique({
    where: { id: caseDbId },
    select: { id: true, annotatorId: true, isReference: true },
  });
  if (!row) return jsonError(404, "notfound");

  if (user.role === "ANNOTATOR") {
    if (!row.isReference && row.annotatorId !== user.id) return jsonError(403, "forbidden");
  } else if (user.role !== "REVIEWER") {
    return jsonError(403, "forbidden");
  }

  const note = await prisma.caseNote.findUnique({
    where: { id: noteId },
    select: { id: true, annotationCaseId: true, authorId: true },
  });
  if (!note || note.annotationCaseId !== caseDbId) return jsonError(404, "notfound");
  if (note.authorId !== user.id) return jsonError(403, "forbidden");

  const replyCount = await prisma.caseNote.count({
    where: { parentNoteId: noteId },
  });
  if (replyCount > 0) {
    return jsonError(400, "has_replies");
  }

  await prisma.caseNote.delete({ where: { id: noteId } });

  revalidatePath("/reviewer");
  revalidatePath("/annotator");
  return NextResponse.json({ ok: true as const });
}
