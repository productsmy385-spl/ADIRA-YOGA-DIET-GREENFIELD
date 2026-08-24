"use server";

import { revalidatePath } from "next/cache";

import { requireTenantSession } from "@/server/auth/guards";
import { markAllRead } from "@/server/repositories/notifications";

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
