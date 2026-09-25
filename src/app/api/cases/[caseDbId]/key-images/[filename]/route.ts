import { NextResponse } from "next/server";
import { CaseStatus } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { resolveAnnotatorWorkspaceUserId } from "@/lib/annotator-workspace";
import { keyImageContentType, readKeyImage } from "@/lib/key-images";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: Request,
  context: { params: Promise<{ caseDbId: string; filename: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { caseDbId, filename: rawFilename } = await context.params;
  const filename = decodeURIComponent(rawFilename);

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
  if (!row?.hasKeyImages) return new NextResponse("Not found", { status: 404 });

  const workspaceUserId = await resolveAnnotatorWorkspaceUserId(user);
  if (user.role !== "REVIEWER") {
    const canView =
      row.isReference ||
      row.annotatorId === workspaceUserId ||
      row.status === CaseStatus.AVAILABLE;
    if (!canView) return new NextResponse("Forbidden", { status: 403 });
  }

  const bytes = await readKeyImage(caseDbId, filename);
  if (!bytes) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": keyImageContentType(filename),
      "Cache-Control": "private, no-store",
    },
  });
}
