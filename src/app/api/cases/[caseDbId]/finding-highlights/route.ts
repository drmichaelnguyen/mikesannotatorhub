import { NextResponse } from "next/server";
import { CaseStatus } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { resolveAnnotatorWorkspaceUserId } from "@/lib/annotator-workspace";
import {
  deleteFindingHighlight,
  normalizeFindingHighlightInput,
  readFindingHighlights,
  sanitizeHighlightsForText,
  upsertFindingHighlight,
  type FindingHighlight,
} from "@/lib/finding-highlights";
import { prisma } from "@/lib/prisma";

async function authorizeFindingHighlights(caseDbId: string) {
  const user = await getCurrentUser();
  if (!user) return { error: new NextResponse("Unauthorized", { status: 401 }) };

  const row = await prisma.annotationCase.findUnique({
    where: { id: caseDbId },
    select: {
      id: true,
      annotatorId: true,
      isReference: true,
      status: true,
      radiologistFinding: true,
    },
  });
  if (!row) return { error: new NextResponse("Not found", { status: 404 }) };
  if (!row.radiologistFinding.trim()) {
    return { error: new NextResponse("Not found", { status: 404 }) };
  }

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
  const auth = await authorizeFindingHighlights(caseDbId);
  if ("error" in auth && auth.error) return auth.error;

  const textLength = auth.row.radiologistFinding.length;
  const data = await readFindingHighlights(caseDbId);
  const highlights = sanitizeHighlightsForText(data.highlights, textLength);
  return NextResponse.json({
    version: 1,
    textLength,
    highlights,
    currentUserId: auth.user.id,
    isReviewer: auth.user.role === "REVIEWER",
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ caseDbId: string }> },
) {
  const { caseDbId } = await context.params;
  const auth = await authorizeFindingHighlights(caseDbId);
  if ("error" in auth && auth.error) return auth.error;

  let body: Partial<FindingHighlight>;
  try {
    body = (await request.json()) as Partial<FindingHighlight>;
  } catch {
    return NextResponse.json({ ok: false, error: "json" }, { status: 400 });
  }

  const textLength = auth.row.radiologistFinding.length;
  const existing =
    typeof body.id === "string" && body.id.trim()
      ? (await readFindingHighlights(caseDbId)).highlights.find((h) => h.id === body.id) ?? null
      : null;

  if (existing && auth.user.role !== "REVIEWER" && existing.authorId !== auth.user.id) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const highlight = normalizeFindingHighlightInput(
    {
      id: body.id,
      start: Number(body.start),
      end: Number(body.end),
      note: String(body.note ?? existing?.note ?? ""),
    },
    textLength,
    { id: auth.user.id, name: auth.user.name },
    existing,
  );
  if (!highlight) {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }

  const data = await upsertFindingHighlight(caseDbId, highlight, textLength);
  return NextResponse.json({ ok: true, highlight, highlights: data.highlights });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ caseDbId: string }> },
) {
  const { caseDbId } = await context.params;
  const auth = await authorizeFindingHighlights(caseDbId);
  if ("error" in auth && auth.error) return auth.error;

  const url = new URL(request.url);
  const highlightId = url.searchParams.get("id")?.trim() || "";
  if (!highlightId) {
    return NextResponse.json({ ok: false, error: "id" }, { status: 400 });
  }

  const current = await readFindingHighlights(caseDbId);
  const existing = current.highlights.find((h) => h.id === highlightId);
  if (!existing) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  if (auth.user.role !== "REVIEWER" && existing.authorId !== auth.user.id) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const textLength = auth.row.radiologistFinding.length;
  const data = await deleteFindingHighlight(caseDbId, highlightId, textLength);
  return NextResponse.json({ ok: true, highlights: data.highlights });
}
