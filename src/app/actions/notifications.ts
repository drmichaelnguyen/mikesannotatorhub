"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import type { NotifType } from "@/lib/notification-types";

export type NotificationItem = {
  id: string;
  type: NotifType;
  createdAt: string;
};

export type NotificationGroup = {
  annotationCaseId: string;
  caseLabel: string;
  items: NotificationItem[];
};

export async function getNotifications(): Promise<NotificationGroup[]> {
  const user = await requireUser();
  const rows = await prisma.notification.findMany({
    where: { userId: user.id, readAt: null },
    orderBy: { createdAt: "desc" },
  });
  const map = new Map<string, NotificationGroup>();
  for (const r of rows) {
    if (!map.has(r.annotationCaseId)) {
      map.set(r.annotationCaseId, {
        annotationCaseId: r.annotationCaseId,
        caseLabel: r.caseLabel,
        items: [],
      });
    }
    map.get(r.annotationCaseId)!.items.push({
      id: r.id,
      type: r.type as NotifType,
      createdAt: r.createdAt.toISOString(),
    });
  }
  return [...map.values()];
}

export async function markCaseNotificationsReadAction(annotationCaseDbId: string) {
  const user = await requireUser();
  await prisma.notification.updateMany({
    where: { userId: user.id, annotationCaseId: annotationCaseDbId, readAt: null },
    data: { readAt: new Date() },
  });
  return { ok: true as const };
}

export async function markAllNotificationsReadAction() {
  const user = await requireUser();
  await prisma.notification.updateMany({
    where: { userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
  return { ok: true as const };
}

export async function getReviewerNotificationRecipients() {
  const reviewers = await prisma.user.findMany({
    where: { role: "REVIEWER" },
    select: { id: true },
  });
  return reviewers.map((u) => u.id);
}

export async function pushNotification(
  userIds: string[],
  type: NotifType,
  annotationCaseId: string,
  caseLabel: string,
) {
  if (userIds.length === 0) return;
  await prisma.notification.createMany({
    data: userIds.map((userId) => ({ userId, type, annotationCaseId, caseLabel })),
  });
}
