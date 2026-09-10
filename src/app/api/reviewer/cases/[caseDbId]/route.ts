
import { withActionLog } from "@/lib/logged-action";
import { NextResponse } from "next/server";
import {
  updateCaseDetailsAction,
  updateCaseReferenceAction,
  updateCaseStatusAction,
} from "@/app/actions/cases";
import { CaseStatus } from "@prisma/client";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ caseDbId: string }> },
) {
  return withActionLog("api/reviewer/cases/[caseDbId]/route.ts:PATCH", await params, async () => {
    const { caseDbId } = await params;
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ ok: false as const, error: "required" as const }, { status: 400 });
    }

    const keys = Object.keys(body as object);
    if (keys.length === 1 && keys[0] === "isReference") {
      const result = await updateCaseReferenceAction({
        caseDbId,
        isReference: Boolean((body as { isReference?: unknown }).isReference),
      });
      return NextResponse.json(result);
    }

    if (
      keys.includes("status") &&
      keys.every((key) => key === "status" || key === "isReference")
    ) {
      const status = (body as { status?: unknown }).status;
      if (typeof status !== "string") {
        return NextResponse.json({ ok: false as const, error: "status" as const }, { status: 400 });
      }
      const result = await updateCaseStatusAction({
        caseDbId,
        status: status as CaseStatus,
        isReference:
          "isReference" in body
            ? Boolean((body as { isReference?: unknown }).isReference)
            : undefined,
      });
      return NextResponse.json(result);
    }

    const result = await updateCaseDetailsAction({
      ...(body as Omit<Parameters<typeof updateCaseDetailsAction>[0], "caseDbId">),
      caseDbId,
    });

    return NextResponse.json(result);
  });
}
