import { actorFromSession } from "@/server/authorization/member-access";
import { canManageWebsite } from "@/server/authorization/permissions";
import { recordAudit } from "@/server/repositories/audit-logs";
import { findMediaAsset } from "@/server/repositories/media";
import type { TenantSessionContext } from "@/server/repositories/sessions";
import {
  ensureWebsite,
  getWebsite,
  listVersions,
  publishWebsite,
  republishWebsite,
  restoreVersion,
  saveDraft,
  setTemplate,
  unpublishWebsite,
  type Website,
  type WebsiteVersion,
} from "@/server/repositories/websites";
import { parseContent, publishProblems, type FieldProblem } from "@/server/website/content";
import { TEMPLATE_KEYS, type TemplateKey } from "@/server/website/templates";

/**
 * Website operations for the admin console — the ONE entry point server actions use.
 *
 * Every function here:
 *   1. checks `canManageWebsite` (server-side; hiding a button is not authorization),
 *   2. takes the organisation from the SESSION, never from its arguments (invariant 1),
 *   3. validates untrusted input before it reaches the repository,
 *   4. audits the sensitive changes — template, publish, unpublish, restore (NFR-SEC-WEB-005).
 *      Draft autosaves are deliberately not audited: one per keystroke pause would bury
 *      the entries that matter.
 */

export type Denied = { ok: false; reason: "FORBIDDEN" };
export type Result<T> = { ok: true; value: T } | Denied | { ok: false; reason: "INVALID"; problems: FieldProblem[] } | { ok: false; reason: "NOT_FOUND" };

const FORBIDDEN: Denied = { ok: false, reason: "FORBIDDEN" };

async function permitted(session: TenantSessionContext, action: string): Promise<boolean> {
  const decision = canManageWebsite(actorFromSession(session));
  if (decision.allowed) return true;
  await recordAudit({
    organizationId: session.organizationId,
    actorDomain: "TENANT",
    actorId: session.userId,
    actorLabel: session.email,
    action,
    resourceType: "website",
    outcome: "DENIED",
    metadata: { reason: decision.reason },
  });
  return false;
}

function audit(session: TenantSessionContext, action: string, metadata: Record<string, unknown>) {
  return recordAudit({
    organizationId: session.organizationId,
    actorDomain: "TENANT",
    actorId: session.userId,
    actorLabel: session.email,
    action,
    resourceType: "website",
    resourceId: session.organizationId,
    outcome: "SUCCESS",
    metadata,
  });
}

export async function loadWebsiteForEditing(
  session: TenantSessionContext,
): Promise<Result<{ website: Website; versions: WebsiteVersion[] }>> {
  if (!(await permitted(session, "website.view"))) return FORBIDDEN;
  const website = await ensureWebsite(session.organizationId, session.organizationName);
  const versions = await listVersions(session.organizationId);
  return { ok: true, value: { website, versions } };
}

export async function saveWebsiteDraft(
  session: TenantSessionContext,
  input: unknown,
): Promise<Result<Website>> {
  if (!(await permitted(session, "website.edit"))) return FORBIDDEN;
  const parsed = parseContent(input);
  if (!parsed.ok) return { ok: false, reason: "INVALID", problems: parsed.problems };

  /*
   * Image URLs are server-owned: the client may only NAME an asset. Each named asset must
   * belong to this organisation (the lookup is scoped by the session's organisation) and
   * be public website media; its URL is then taken from the database. Anything else —
   * another tenant's asset id, a private photo, a URL typed by the client — is dropped.
   */
  const content = parsed.content;
  const images = [
    content.branding.logo,
    content.branding.favicon,
    content.branding.cover,
    content.hero.image,
    ...content.team.map((m) => m.photo),
  ];
  for (const img of images) {
    const asset = img.assetId ? await findMediaAsset(session.organizationId, img.assetId) : null;
    if (asset && asset.purpose === "website" && !asset.requiresSignedUrl) {
      img.url = asset.url;
    } else {
      img.assetId = null;
      img.url = null;
    }
  }

  const saved = await saveDraft(session.organizationId, session.userId, content);
  return saved ? { ok: true, value: saved } : { ok: false, reason: "NOT_FOUND" };
}

export async function changeWebsiteTemplate(
  session: TenantSessionContext,
  templateKey: string,
): Promise<Result<{ previous: string; next: TemplateKey }>> {
  if (!(await permitted(session, "website.manage_templates"))) return FORBIDDEN;
  if (!TEMPLATE_KEYS.includes(templateKey as TemplateKey)) {
    return { ok: false, reason: "INVALID", problems: [{ field: "template", message: "Unknown template" }] };
  }
  const changed = await setTemplate(session.organizationId, session.userId, templateKey);
  if (!changed) return { ok: false, reason: "NOT_FOUND" };
  await audit(session, "website.template_change", { from: changed.previous, to: templateKey });
  return { ok: true, value: { previous: changed.previous, next: templateKey as TemplateKey } };
}

export async function publishOrganizationWebsite(
  session: TenantSessionContext,
): Promise<Result<{ versionId: string }>> {
  if (!(await permitted(session, "website.publish"))) return FORBIDDEN;
  const site = await getWebsite(session.organizationId);
  if (!site) return { ok: false, reason: "NOT_FOUND" };

  const problems = publishProblems(site.draft, site.templateKey);
  if (problems.length > 0) return { ok: false, reason: "INVALID", problems };

  const published = await publishWebsite(session.organizationId, session.userId);
  if (!published) return { ok: false, reason: "NOT_FOUND" };
  await audit(session, "website.publish", {
    versionId: published.versionId,
    template: published.templateKey,
  });
  return { ok: true, value: { versionId: published.versionId } };
}

export async function unpublishOrganizationWebsite(
  session: TenantSessionContext,
): Promise<Result<null>> {
  if (!(await permitted(session, "website.publish"))) return FORBIDDEN;
  const done = await unpublishWebsite(session.organizationId);
  if (!done) return { ok: false, reason: "NOT_FOUND" };
  await audit(session, "website.unpublish", {});
  return { ok: true, value: null };
}

export async function republishOrganizationWebsite(
  session: TenantSessionContext,
): Promise<Result<null>> {
  if (!(await permitted(session, "website.publish"))) return FORBIDDEN;
  const done = await republishWebsite(session.organizationId);
  if (!done) return { ok: false, reason: "NOT_FOUND" };
  await audit(session, "website.republish", {});
  return { ok: true, value: null };
}

export async function restoreWebsiteVersion(
  session: TenantSessionContext,
  versionId: string,
): Promise<Result<null>> {
  if (!(await permitted(session, "website.edit"))) return FORBIDDEN;
  if (!/^[0-9a-f-]{36}$/i.test(versionId)) return { ok: false, reason: "NOT_FOUND" };
  const done = await restoreVersion(session.organizationId, session.userId, versionId);
  if (!done) return { ok: false, reason: "NOT_FOUND" };
  await audit(session, "website.restore", { versionId });
  return { ok: true, value: null };
}
