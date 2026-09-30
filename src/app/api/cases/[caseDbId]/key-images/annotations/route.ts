import { NextResponse } from "next/server";
import { CaseStatus } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { resolveAnnotatorWorkspaceUserId } from "@/lib/annotator-workspace";
import {
  deleteKeyImageMark,
  normalizeKeyImageMarkInput,
  readKeyImageAnnotations,
  upsertKeyImageMark,
  type KeyImageMark,
} from "@/lib/key-image-annotations";
import { listKeyImages } from "@/lib/key-images";
import { prisma } from "@/lib/prisma";

async function authorizeKeyImageAnnotations(caseDbId: string) {
  const user = await getCurrentUser();
  if (!user) return { error: new NextResponse("Unauthorized", { status: 401 }) };

  const row = await prisma.annotationCase.findUnique({
    where: { id: caseDbId },
    select: {
      id: true,
      annotatorId: true,
      isReference: true,
      status: true,
      hasKeyImages: true,
    },
  });
  if (!row?.hasKeyImages) return { error: new NextResponse("Not found", { status: 404 }) };

  const workspaceUserId = await resolveAnnotatorWorkspaceUserId(user);
  if (user.role !== "REVIEWER") {
    const canView =
      row.isReference ||
      row.annotatorId === workspaceUserId ||
      row.status === CaseStatus.AVAILABLE;
    if (!canView) return { error: new NextResponse("Forbidden", { status: 403 }) };
  }

  return { user, row, workspaceUserId };
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ caseDbId: string }> },
) {
  const { caseDbId } = await context.params;
  const auth = await authorizeKeyImageAnnotations(caseDbId);
  if ("error" in auth && auth.error) return auth.error;

  const data = await readKeyImageAnnotations(caseDbId);
  return NextResponse.json({
    ...data,
    currentUserId: auth.user.id,
    isReviewer: auth.user.role === "REVIEWER",
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ caseDbId: string }> },
) {
  const { caseDbId } = await context.params;
  const auth = await authorizeKeyImageAnnotations(caseDbId);
  if ("error" in auth && auth.error) return auth.error;

  let body: Partial<KeyImageMark>;
  try {
    body = (await request.json()) as Partial<KeyImageMark>;
  } catch {
    return NextResponse.json({ ok: false, error: "json" }, { status: 400 });
  }

  const files = await listKeyImages(caseDbId);
  const filename = String(body.filename ?? "").trim();
  if (!files.includes(filename)) {
    return NextResponse.json({ ok: false, error: "filename" }, { status: 400 });
  }

  const existing =
    typeof body.id === "string" && body.id.trim()
      ? (await readKeyImageAnnotations(caseDbId)).marks.find((m) => m.id === body.id) ?? null
      : null;

  // Only author or reviewer can edit an existing mark.
  if (existing && auth.user.role !== "REVIEWER" && existing.authorId !== auth.user.id) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const mark = normalizeKeyImageMarkInput(
    {
      id: body.id,
      filename,
      x: Number(body.x),
      y: Number(body.y),
      note: String(body.note ?? ""),
    },
    { id: auth.user.id, name: auth.user.name },
    existing,
  );
  if (!mark) {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }

  const data = await upsertKeyImageMark(caseDbId, mark);
  return NextResponse.json({ ok: true, mark, marks: data.marks });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ caseDbId: string }> },
) {
  const { caseDbId } = await context.params;
  const auth = await authorizeKeyImageAnnotations(caseDbId);
  if ("error" in auth && auth.error) return auth.error;

  const url = new URL(request.url);
  const markId = url.searchParams.get("id")?.trim() || "";
  if (!markId) {
    return NextResponse.json({ ok: false, error: "id" }, { status: 400 });
  }

  const current = await readKeyImageAnnotations(caseDbId);
  const existing = current.marks.find((m) => m.id === markId);
  if (!existing) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  if (auth.user.role !== "REVIEWER" && existing.authorId !== auth.user.id) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const data = await deleteKeyImageMark(caseDbId, markId);
  return NextResponse.json({ ok: true, marks: data.marks });
}
