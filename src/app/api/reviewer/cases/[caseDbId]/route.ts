import { NextResponse } from "next/server";
import { updateCaseDetailsAction, updateCaseReferenceAction } from "@/app/actions/cases";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ caseDbId: string }> },
) {
  const { caseDbId } = await params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false as const, error: "required" as const }, { status: 400 });
  }

  if ("isReference" in body && Object.keys(body).length === 1) {
    const result = await updateCaseReferenceAction({
      caseDbId,
      isReference: Boolean((body as { isReference?: unknown }).isReference),
    });
    return NextResponse.json(result);
  }

  const result = await updateCaseDetailsAction({
    ...(body as Omit<Parameters<typeof updateCaseDetailsAction>[0], "caseDbId">),
    caseDbId,
  });

  return NextResponse.json(result);
}
