import { NextResponse } from "next/server";
import { CaseStatus } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { resolveAnnotatorWorkspaceUserId } from "@/lib/annotator-workspace";
import { stagesFromJson } from "@/lib/case-study-history";
import { normalizeStudyId } from "@/lib/radiologist-findings";
import { prisma } from "@/lib/prisma";

async function authorizeStudyHistory(caseDbId: string) {
  const user = await getCurrentUser();
  if (!user) return { error: new NextResponse("Unauthorized", { status: 401 }) };

  const row = await prisma.annotationCase.findUnique({
    where: { id: caseDbId },
    select: {
      id: true,
      caseId: true,
      annotatorId: true,
      isReference: true,
      status: true,
    },
  });
  if (!row) return { error: new NextResponse("Not found", { status: 404 }) };

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
  const auth = await authorizeStudyHistory(caseDbId);
  if ("error" in auth && auth.error) return auth.error;

  const studyIdNorm = normalizeStudyId(auth.row.caseId);
  const history = await prisma.caseStudyHistory.findUnique({
    where: { studyIdNorm },
  });

  if (!history) {
    return NextResponse.json({
      found: false,
      studyId: auth.row.caseId,
      redbrickStage: "",
      stages: [],
    });
  }

  return NextResponse.json({
    found: true,
    studyId: history.studyId,
    redbrickStage: history.redbrickStage,
    stages: stagesFromJson(history.stagesJson),
  });
}
