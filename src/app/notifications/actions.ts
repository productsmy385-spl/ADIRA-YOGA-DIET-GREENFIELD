"use server";

import { revalidatePath } from "next/cache";

import { requireTenantSession } from "@/server/auth/guards";
import { markAllRead, markRead } from "@/server/repositories/notifications";

/**
 * Mark this member's notifications read.
 *
 * Identity comes from the session. There is no recipient argument, so there is nothing a
 * caller could substitute to mark somebody else's notifications read (ADR-004).
 */
export async function markAllReadAction(): Promise<void> {
  const session = await requireTenantSession();
  await markAllRead(session.organizationId, session.userId);
  revalidatePath("/notifications");
}

/**
 * Mark ONE notification read.
 *
 * `markRead` existed in the repository with no caller, so the only way to clear the unread
 * badge was to clear the whole list — which meant reading one thing and dismissing
 * everything were the same gesture.
 *
 * The id is a parameter here, unlike the recipient, and that difference is the security
 * boundary: `markRead` scopes its UPDATE by `organization_id` AND `recipient_id`, both
 * from the session. A forged notification id therefore matches no row rather than
 * touching somebody else's, and the boolean it returns is deliberately discarded — telling
 * a caller whether an id existed is an oracle, and there is nothing useful to do with the
 * answer.
 */
export async function markReadAction(formData: FormData): Promise<void> {
  const session = await requireTenantSession();

  const notificationId = String(formData.get("notificationId") ?? "");
  if (!notificationId) return;

  await markRead(session.organizationId, session.userId, notificationId);
  revalidatePath("/notifications");
}
