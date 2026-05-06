import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getReviewerNotificationRecipients, pushNotification } from "@/app/actions/notifications";
import { NOTIF } from "@/lib/notification-types";
import { getCaseNoteImages } from "@/lib/case-note-images";

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false as const, error }, { status });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ caseDbId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return jsonError(401, "auth");

  const { caseDbId } = await context.params;
  const row = await prisma.annotationCase.findUnique({
    where: { id: caseDbId },
    select: {
      id: true,
      annotatorId: true,
      isReference: true,
      caseNotes: {
        orderBy: { createdAt: "asc" },
        include: { author: { select: { id: true, name: true, role: true } } },
      },
    },
  });
  if (!row) return jsonError(404, "notfound");

  if (user.role === "ANNOTATOR") {
    if (!row.isReference && row.annotatorId !== user.id) return jsonError(403, "forbidden");
  } else if (user.role !== "REVIEWER") {
    return jsonError(403, "forbidden");
  }

  return NextResponse.json({
    ok: true as const,
    notes: row.caseNotes.map((note) => ({
      id: note.id,
      parentNoteId: note.parentNoteId,
      content: note.content,
      images: getCaseNoteImages(note),
      createdAt: note.createdAt.toISOString(),
      author: { name: note.author.name, role: note.author.role },
    })),
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ caseDbId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return jsonError(401, "auth");

  const { caseDbId } = await context.params;
  const body = (await request.json().catch(() => null)) as
    | {
        content?: unknown;
        imageDataList?: unknown;
        parentNoteId?: unknown;
      }
    | null;

  const row = await prisma.annotationCase.findUnique({ where: { id: caseDbId } });
  if (!row) return jsonError(404, "notfound");

  if (user.role === "ANNOTATOR") {
    if (!row.isReference && row.annotatorId !== user.id) return jsonError(403, "forbidden");
  } else if (user.role !== "REVIEWER") {
    return jsonError(403, "forbidden");
  }

  const parentNoteId =
    typeof body?.parentNoteId === "string" && body.parentNoteId.trim()
      ? body.parentNoteId.trim()
      : null;

  if (parentNoteId) {
    const parent = await prisma.caseNote.findUnique({
      where: { id: parentNoteId },
      select: { id: true, annotationCaseId: true },
    });
    if (!parent || parent.annotationCaseId !== row.id) {
      return jsonError(400, "invalid_parent");
    }
  }

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

  await prisma.caseNote.create({
    data: {
      annotationCaseId: row.id,
      parentNoteId,
      authorId: user.id,
      content: text || null,
      imageData: images[0] ?? null,
      imageDataListJson: images.length > 0 ? JSON.stringify(images) : null,
    },
  });

  if (user.role === "REVIEWER" && row.isReference) {
    const allAnnotators = await prisma.user.findMany({
      where: { role: "ANNOTATOR" },
      select: { id: true },
    });
    await pushNotification(
      allAnnotators.map((annotator) => annotator.id),
      NOTIF.NEW_COMMENT,
      row.id,
      row.caseId,
    );
  } else if (user.role === "REVIEWER" && row.annotatorId) {
    await pushNotification([row.annotatorId], NOTIF.NEW_COMMENT, row.id, row.caseId);
  }
  if (user.role === "ANNOTATOR") {
    const reviewerIds = await getReviewerNotificationRecipients();
    await pushNotification(reviewerIds, NOTIF.NEW_COMMENT, row.id, row.caseId);
  }

  revalidatePath("/reviewer");
  revalidatePath("/annotator");
  return NextResponse.json({ ok: true as const });
}
