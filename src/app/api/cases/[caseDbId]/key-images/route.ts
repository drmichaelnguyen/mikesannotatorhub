import { NextResponse } from "next/server";
import { CaseStatus } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { resolveAnnotatorWorkspaceUserId } from "@/lib/annotator-workspace";
import { listKeyImages } from "@/lib/key-images";
import { prisma } from "@/lib/prisma";

async function authorizeKeyImages(caseDbId: string) {
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
      keyImageCount: true,
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

  return { user, row };
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ caseDbId: string }> },
) {
  const { caseDbId } = await context.params;
  const auth = await authorizeKeyImages(caseDbId);
  if ("error" in auth && auth.error) return auth.error;

  const files = await listKeyImages(caseDbId);
  return NextResponse.json({
    files,
    count: files.length,
  });
}
