import { NextResponse } from "next/server";
import { assignCaseAction } from "@/app/actions/cases";

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false as const, error }, { status });
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ caseDbId: string }> },
) {
  const { caseDbId } = await context.params;
  try {
    const result = await assignCaseAction(caseDbId);
    if (!result.ok) {
      return NextResponse.json(result, {
        status:
          result.error === "pending_review_ack" || result.error === "active_case" ? 409 : 400,
      });
    }
    return NextResponse.json(result);
  } catch {
    return jsonError(401, "auth");
  }
}
