"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";

const MIN_PASSWORD = 8;

export type CreateAnnotatorResult =
  | { ok: true }
  | {
      ok: false;
      error: "required" | "password_short" | "email_invalid" | "email_taken" | "forbidden";
    };

export async function createAnnotatorAccountAction(formData: FormData): Promise<CreateAnnotatorResult> {
  try {
    await requireRole("REVIEWER");
  } catch {
    return { ok: false, error: "forbidden" };
  }

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const name = String(formData.get("name") ?? "").trim();

  if (!email || !password || !name) {
    return { ok: false, error: "required" };
  }
  if (password.length < MIN_PASSWORD) {
    return { ok: false, error: "password_short" };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "email_invalid" };
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.user.create({
      data: {
        email,
        passwordHash,
        name,
        role: "ANNOTATOR",
      },
    });
  } catch {
    return { ok: false, error: "email_taken" };
  }

  revalidatePath("/reviewer");
  return { ok: true };
}
