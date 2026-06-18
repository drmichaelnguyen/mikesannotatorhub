"use server";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { getCaseNoteImages } from "@/lib/case-note-images";
import type { AdvancedDataBundle, AdvancedDataTable } from "@/lib/advanced-data-view";

function iso(d: Date | null | undefined): string {
  return d?.toISOString() ?? "";
}

function previewText(s: string | null | undefined, max = 200): string {
  if (!s) return "";
  const plain = s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (plain.length <= max) return plain;
  return `${plain.slice(0, max)}…`;
}

function table(entity: AdvancedDataTable["entity"], columns: string[], rows: Record<string, string>[]): AdvancedDataTable {
  return { entity, columns, rows };
}

export async function listReviewerAdvancedDataAction(): Promise<AdvancedDataBundle> {
  await requireRole("REVIEWER");

  const [cases, topics, guides, users, notes] = await Promise.all([
    prisma.annotationCase.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        guide: { select: { title: true } },
        caseTopics: { include: { topic: { select: { name: true } } } },
        annotator: { select: { email: true, name: true } },
        auditedBy: { select: { email: true } },
        _count: { select: { caseNotes: true, reviews: true } },
      },
    }),
    prisma.topic.findMany({
      orderBy: { updatedAt: "desc" },
      include: { projects: true, scopes: true },
    }),
    prisma.guide.findMany({ orderBy: { updatedAt: "desc" } }),
    prisma.user.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.caseNote.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        author: { select: { email: true, name: true } },
        annotationCase: { select: { caseId: true } },
      },
    }),
  ]);

  return {
    cases: table(
      "cases",
      [
        "id",
        "caseId",
        "status",
        "redbrickProject",
        "scopeOfWork",
        "guide",
        "topics",
        "annotator",
        "annotatorEmail",
        "assignedAt",
        "completedAt",
        "auditedAt",
        "auditedBy",
        "compensationType",
        "compensationAmount",
        "annotatorBonus",
        "minMinutes",
        "maxMinutes",
        "annotationMinutes",
        "difficultyRating",
        "qualityRating",
        "isReference",
        "noteCount",
        "reviewCount",
        "createdAt",
        "updatedAt",
      ],
      cases.map((c) => ({
        id: c.id,
        caseId: c.caseId,
        status: c.status,
        redbrickProject: c.redbrickProject,
        scopeOfWork: c.scopeOfWork,
        guide: c.guide?.title ?? "",
        topics: c.caseTopics.map((ct) => ct.topic.name).join("; "),
        annotator: c.annotator?.name ?? "",
        annotatorEmail: c.annotator?.email ?? "",
        assignedAt: iso(c.assignedAt),
        completedAt: iso(c.completedAt),
        auditedAt: iso(c.auditedAt),
        auditedBy: c.auditedBy?.email ?? "",
        compensationType: c.compensationType,
        compensationAmount: String(c.compensationAmount),
        annotatorBonus: String(c.annotatorBonus),
        minMinutes: String(c.minMinutesPerCase),
        maxMinutes: String(c.maxMinutesPerCase),
        annotationMinutes: c.annotationMinutes != null ? String(c.annotationMinutes) : "",
        difficultyRating: c.difficultyRating != null ? String(c.difficultyRating) : "",
        qualityRating: c.qualityRating != null ? String(c.qualityRating) : "",
        isReference: c.isReference ? "yes" : "no",
        noteCount: String(c._count.caseNotes),
        reviewCount: String(c._count.reviews),
        createdAt: iso(c.createdAt),
        updatedAt: iso(c.updatedAt),
      })),
    ),
    topics: table(
      "topics",
      ["id", "name", "description", "projects", "scopes", "createdAt", "updatedAt"],
      topics.map((t) => ({
        id: t.id,
        name: t.name,
        description: previewText(t.description, 500),
        projects: t.projects.map((p) => p.redbrickProject).join("; "),
        scopes: t.scopes.map((s) => s.scopeOfWork).join("; "),
        createdAt: iso(t.createdAt),
        updatedAt: iso(t.updatedAt),
      })),
    ),
    guides: table(
      "guides",
      ["id", "title", "content", "createdAt", "updatedAt"],
      guides.map((g) => ({
        id: g.id,
        title: g.title,
        content: previewText(g.content, 500),
        createdAt: iso(g.createdAt),
        updatedAt: iso(g.updatedAt),
      })),
    ),
    users: table(
      "users",
      ["id", "name", "email", "role", "createdAt"],
      users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        createdAt: iso(u.createdAt),
      })),
    ),
    notes: table(
      "notes",
      [
        "id",
        "caseDbId",
        "caseId",
        "author",
        "authorEmail",
        "content",
        "imageCount",
        "isQuestion",
        "parentNoteId",
        "createdAt",
      ],
      notes.map((n) => ({
        id: n.id,
        caseDbId: n.annotationCaseId,
        caseId: n.annotationCase.caseId,
        author: n.author.name,
        authorEmail: n.author.email,
        content: previewText(n.content, 300),
        imageCount: String(getCaseNoteImages(n).length),
        isQuestion: n.isQuestion ? "yes" : "no",
        parentNoteId: n.parentNoteId ?? "",
        createdAt: iso(n.createdAt),
      })),
    ),
  };
}
