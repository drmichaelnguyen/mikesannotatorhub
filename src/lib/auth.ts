import { prisma } from "./prisma";
import { readSession } from "./session";
import { UserRole } from "@prisma/client";

export async function getCurrentUser() {
  const s = await readSession();
  if (!s) return null;
  return prisma.user.findUnique({ where: { id: s.userId } });
}

export async function requireUser() {
  const u = await getCurrentUser();
  if (!u) throw new Error("Unauthorized");
  return u;
}

export async function requireRole(role: UserRole) {
  const u = await requireUser();
  if (u.role !== role) throw new Error("Forbidden");
  return u;
}
