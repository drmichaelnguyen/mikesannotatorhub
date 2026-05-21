import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** Seed convention: reviewer `you@x.com` ↔ annotator `you+annotator@x.com` (one login, two UIs). */
export function linkedAnnotatorEmailForReviewer(reviewerEmail: string): string | null {
  const email = reviewerEmail.trim().toLowerCase();
  const at = email.indexOf("@");
  if (at <= 0) return null;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (local.includes("+annotator")) return null;
  return `${local}+annotator@${domain}`;
}

/** User id whose cases/availability the annotator workspace should show. */
export async function resolveAnnotatorWorkspaceUserId(
  user: Pick<User, "id" | "role" | "email">,
): Promise<string> {
  if (user.role === "ANNOTATOR") return user.id;
  const linkedEmail = linkedAnnotatorEmailForReviewer(user.email);
  if (!linkedEmail) return user.id;
  const linked = await prisma.user.findUnique({
    where: { email: linkedEmail },
    select: { id: true, role: true },
  });
  if (linked?.role === "ANNOTATOR") return linked.id;
  return user.id;
}

export async function requireAnnotatorWorkspace() {
  const { requireAnyRole } = await import("./auth");
  const user = await requireAnyRole(["ANNOTATOR", "REVIEWER"]);
  const workspaceUserId = await resolveAnnotatorWorkspaceUserId(user);
  return { user, workspaceUserId };
}
