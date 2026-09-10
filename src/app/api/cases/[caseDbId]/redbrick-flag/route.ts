
import { withActionLog } from "@/lib/logged-action";
import { NextResponse } from "next/server";
import { flagRedbrickAssignmentAction } from "@/app/actions/redbrick-flags";

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false as const, error }, { status });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ caseDbId: string }> },
) {
  return withActionLog("api/cases/[caseDbId]/redbrick-flag/route.ts:POST", await context.params, async () => {
    const { caseDbId } = await context.params;
    let comment: string | undefined;
    try {
      const body = (await request.json().catch(() => null)) as { comment?: string } | null;
      comment = body?.comment;
    } catch {
      comment = undefined;
    }
    try {
      const result = await flagRedbrickAssignmentAction({ caseDbId, comment });
      if (!result.ok) {
        const status =
          result.error === "forbidden" ? 403 : result.error === "already_flagged" ? 409 : 400;
        return NextResponse.json(result, { status });
      }
      return NextResponse.json(result);
    } catch {
      return jsonError(401, "auth");
    }
  });
}
