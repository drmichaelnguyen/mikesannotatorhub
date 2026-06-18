import { NextResponse } from "next/server";
import { CaseStatus } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { resolveAnnotatorWorkspaceUserId } from "@/lib/annotator-workspace";
import { readContinuityReport } from "@/lib/continuity-reports";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: Request,
  context: { params: Promise<{ caseDbId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { caseDbId } = await context.params;
  const row = await prisma.annotationCase.findUnique({
    where: { id: caseDbId },
    select: {
      id: true,
      annotatorId: true,
      isReference: true,
      status: true,
      hasContinuityReport: true,
    },
  });
  if (!row?.hasContinuityReport) return new NextResponse("Not found", { status: 404 });

  const workspaceUserId = await resolveAnnotatorWorkspaceUserId(user);
  if (user.role !== "REVIEWER") {
    const canView =
      row.isReference ||
      row.annotatorId === workspaceUserId ||
      row.status === CaseStatus.AVAILABLE;
    if (!canView) return new NextResponse("Forbidden", { status: 403 });
  }

  const html = await readContinuityReport(caseDbId);
  if (!html) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
    },
  });
}
