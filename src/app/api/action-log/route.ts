import { getCurrentUser } from "@/lib/auth";
import { writeActionLog } from "@/lib/action-log";

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return new Response(null, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return new Response(null, { status: 401 });
  // Bound the body even if Content-Length is absent or incorrect.
  const reader = request.body?.getReader();
  if (!reader) return new Response(null, { status: 400 });
  let text = "";
  let size = 0;
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 2048) { await reader.cancel(); return new Response(null, { status: 413 }); }
    text += decoder.decode(value, { stream: true });
  }
  let body;
  try { body = JSON.parse(text + decoder.decode()); } catch { return new Response(null, { status: 400 }); }
  if (!body || !["form_submit", "validation_blocked", "field_changed"].includes(body.event) ||
      typeof body.page !== "string" || !/^\/[a-zA-Z0-9/_-]{0,200}$/.test(body.page) ||
      typeof body.field !== "string" || !/^[a-zA-Z0-9_-]{0,100}$/.test(body.field)) {
    return new Response(null, { status: 400 });
  }
  await writeActionLog({ action: body.event, outcome: "client_reported", actorId: user.id, page: body.page, field: body.field });
  return new Response(null, { status: 204 });
}
