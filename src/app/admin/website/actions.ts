"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/server/auth/guards";
import {
  changeWebsiteTemplate,
  publishOrganizationWebsite,
  republishOrganizationWebsite,
  restoreWebsiteVersion,
  saveWebsiteDraft,
  unpublishOrganizationWebsite,
  type Result,
} from "@/server/services/website";
import type { FieldProblem } from "@/server/website/content";

/**
 * Website editor actions (WEBSITE-BUILDER-PRD §5).
 *
 * Thin by design: `requireRole("ADMIN")` for the session, then the service, which checks
 * `canManageWebsite`, takes the organisation from that session, validates and audits.
 * No action accepts an organisation id or a website id (invariant 1).
 */

export type ActionOutcome =
  | { ok: true; message?: string }
  | { ok: false; message: string; problems?: FieldProblem[] };

function outcome<T>(result: Result<T>, success?: string): ActionOutcome {
  if (result.ok) return { ok: true, message: success };
  switch (result.reason) {
    case "FORBIDDEN":
      return { ok: false, message: "You do not have permission to manage the website." };
    case "INVALID":
      return { ok: false, message: "Some details need attention.", problems: result.problems };
    case "NOT_FOUND":
      return { ok: false, message: "That no longer exists. Reload the page." };
  }
}

async function revalidateSite(slug: string) {
  revalidatePath("/admin/website");
  revalidatePath(`/s/${slug}`);
}

/** Autosave target. Draft only — the live site is untouched (FR-WEB-007). */
export async function saveDraftAction(content: unknown): Promise<ActionOutcome> {
  const session = await requireRole("ADMIN");
  const result = await saveWebsiteDraft(session, content);
  return outcome(result);
}

export async function changeTemplateAction(templateKey: string): Promise<ActionOutcome> {
  const session = await requireRole("ADMIN");
  const result = await changeWebsiteTemplate(session, String(templateKey));
  revalidatePath("/admin/website");
  return outcome(result, "Template applied. Your content is unchanged.");
}

export async function publishAction(): Promise<ActionOutcome> {
  const session = await requireRole("ADMIN");
  const result = await publishOrganizationWebsite(session);
  if (result.ok) await revalidateSite(session.organizationSlug);
  return outcome(result, "Published. Your website is live.");
}

export async function unpublishAction(): Promise<ActionOutcome> {
  const session = await requireRole("ADMIN");
  const result = await unpublishOrganizationWebsite(session);
  if (result.ok) await revalidateSite(session.organizationSlug);
  return outcome(result, "Unpublished. Visitors now see a not-found page.");
}

export async function republishAction(): Promise<ActionOutcome> {
  const session = await requireRole("ADMIN");
  const result = await republishOrganizationWebsite(session);
  if (result.ok) await revalidateSite(session.organizationSlug);
  return outcome(result, "Your last published version is live again.");
}

export async function restoreVersionAction(versionId: string): Promise<ActionOutcome> {
  const session = await requireRole("ADMIN");
  const result = await restoreWebsiteVersion(session, String(versionId));
  revalidatePath("/admin/website");
  return outcome(result, "Restored into your draft. Publish when you're ready.");
}
