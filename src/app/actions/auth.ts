"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createSession, destroySession } from "@/lib/session";

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { ok: false as const, error: "required" as const };

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return { ok: false as const, error: "login" as const };

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) return { ok: false as const, error: "login" as const };

  await createSession(user.id);
  return { ok: true as const, role: user.role };
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
