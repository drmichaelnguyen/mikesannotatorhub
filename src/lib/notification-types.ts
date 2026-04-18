export const NOTIF = {
  NEW_CASE: "NEW_CASE",
  CASE_ASSIGNED: "CASE_ASSIGNED",
  NEW_COMMENT: "NEW_COMMENT",
  CASE_REJECTED: "CASE_REJECTED",
} as const;

export type NotifType = (typeof NOTIF)[keyof typeof NOTIF];
