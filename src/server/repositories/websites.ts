/**
 * Organisation websites (WEBSITE-BUILDER-PRD, migration 013).
 *
 * TENANT SCOPE (invariant 1, ADR-004). Every function that touches a draft, a publish
 * state or a version takes `organizationId` as a required argument, which callers source
 * from the session — never from a request. There is no function that takes a website id,
 * because the organisation id IS the website's key.
 *
 * THE ONE PUBLIC READ is `findLiveSiteBySlug`, and its SELECT names only published
 * columns: a public request can never see a draft, an unpublished site, or a suspended
 * organisation's site (NFR-SEC-WEB-002).
 */

import { query, queryOne, transaction } from "@/server/db/pool";
import { defaultContent, parseContent, type WebsiteContent } from "@/server/website/content";
import { DEFAULT_TEMPLATE } from "@/server/website/templates";

/** How many published versions are kept for restore (FR-WEB-012). */
export const VERSIONS_KEPT = 20;

export type WebsiteStatus = "DRAFT" | "PUBLISHED" | "CHANGES_PENDING" | "UNPUBLISHED";

export interface Website {
  organizationId: string;
  templateKey: string;
  draft: WebsiteContent;
  draftUpdatedAt: Date;
  publishedTemplateKey: string | null;
  publishedAt: Date | null;
  isLive: boolean;
  status: WebsiteStatus;
}

interface WebsiteRow {
  organization_id: string;
  template_key: string;
  draft_content: unknown;
  draft_updated_at: Date;
  published_template_key: string | null;
  published_content: unknown;
  published_at: Date | null;
  is_live: boolean;
}

/**
 * FR-WEB-009. "Changes pending" compares the documents themselves rather than timestamps,
 * so saving the same content twice does not falsely report unpublished changes.
 */
export function statusOf(row: {
  isLive: boolean;
  publishedAt: Date | null;
  templateKey: string;
  publishedTemplateKey: string | null;
  draft: unknown;
  published: unknown;
}): WebsiteStatus {
  if (!row.publishedAt) return "DRAFT";
  if (!row.isLive) return "UNPUBLISHED";
  const same =
    row.templateKey === row.publishedTemplateKey &&
    JSON.stringify(row.draft) === JSON.stringify(row.published);
  return same ? "PUBLISHED" : "CHANGES_PENDING";
}

function toWebsite(row: WebsiteRow): Website {
  // A stored document is re-parsed so an older schema version always reads in the
  // current shape. Unparseable content (should be impossible) degrades to defaults
  // rather than breaking the editor.
  const parsed = parseContent(row.draft_content);
  const draft = parsed.ok ? parsed.content : defaultContent("");
  const published = row.published_content ? parseContent(row.published_content) : null;
  return {
    organizationId: row.organization_id,
    templateKey: row.template_key,
    draft,
    draftUpdatedAt: row.draft_updated_at,
    publishedTemplateKey: row.published_template_key,
    publishedAt: row.published_at,
    isLive: row.is_live,
    status: statusOf({
      isLive: row.is_live,
      publishedAt: row.published_at,
      templateKey: row.template_key,
      publishedTemplateKey: row.published_template_key,
      draft,
      published: published?.ok ? published.content : null,
    }),
  };
}

const COLUMNS = `organization_id, template_key, draft_content, draft_updated_at,
  published_template_key, published_content, published_at, is_live`;

export async function getWebsite(organizationId: string): Promise<Website | null> {
  const row = await queryOne<WebsiteRow>(
    `SELECT ${COLUMNS} FROM organization_websites WHERE organization_id = $1`,
    [organizationId],
  );
  return row ? toWebsite(row) : null;
}

/** The website, created with a starting draft on first visit. Idempotent under races. */
export async function ensureWebsite(
  organizationId: string,
  organizationName: string,
): Promise<Website> {
  await query(
    `INSERT INTO organization_websites (organization_id, template_key, draft_content)
     VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (organization_id) DO NOTHING`,
    [organizationId, DEFAULT_TEMPLATE, JSON.stringify(defaultContent(organizationName))],
  );
  const site = await getWebsite(organizationId);
  if (!site) throw new Error("website row missing after ensure");
  return site;
}

/** Autosave. Touches the draft only — never what the public sees (FR-WEB-007). */
export async function saveDraft(
  organizationId: string,
  userId: string,
  content: WebsiteContent,
): Promise<Website | null> {
  const row = await queryOne<WebsiteRow>(
    `UPDATE organization_websites
        SET draft_content = $3::jsonb, draft_updated_at = now(), draft_updated_by = $2
      WHERE organization_id = $1
      RETURNING ${COLUMNS}`,
    [organizationId, userId, JSON.stringify(content)],
  );
  return row ? toWebsite(row) : null;
}

/** Changes the look of the DRAFT; content untouched (FR-WEB-003). Returns the previous key. */
export async function setTemplate(
  organizationId: string,
  userId: string,
  templateKey: string,
): Promise<{ previous: string } | null> {
  const row = await queryOne<{ previous: string }>(
    `UPDATE organization_websites w
        SET template_key = $3, draft_updated_at = now(), draft_updated_by = $2
       FROM (SELECT template_key AS previous FROM organization_websites
              WHERE organization_id = $1 FOR UPDATE) old
      WHERE w.organization_id = $1
      RETURNING old.previous`,
    [organizationId, userId, templateKey],
  );
  return row ?? null;
}

/**
 * Publish: draft → live, plus a version for restore, pruned to VERSIONS_KEPT.
 * One transaction, the row locked, so two admins publishing at once cannot interleave.
 * Callers must have run `publishProblems` first — this function does not judge content.
 */
export async function publishWebsite(
  organizationId: string,
  userId: string,
): Promise<{ versionId: string; templateKey: string } | null> {
  return transaction(async (client) => {
    const { rows } = await client.query<{ template_key: string; draft_content: unknown }>(
      `SELECT template_key, draft_content FROM organization_websites
        WHERE organization_id = $1 FOR UPDATE`,
      [organizationId],
    );
    const current = rows[0];
    if (!current) return null;

    await client.query(
      `UPDATE organization_websites
          SET published_template_key = template_key, published_content = draft_content,
              published_at = now(), published_by = $2, is_live = true
        WHERE organization_id = $1`,
      [organizationId, userId],
    );

    const version = await client.query<{ id: string }>(
      `INSERT INTO organization_website_versions
         (organization_id, template_key, content, published_by)
       VALUES ($1, $2, $3::jsonb, $4)
       RETURNING id`,
      [organizationId, current.template_key, JSON.stringify(current.draft_content), userId],
    );

    await client.query(
      `DELETE FROM organization_website_versions
        WHERE organization_id = $1
          AND id NOT IN (SELECT id FROM organization_website_versions
                          WHERE organization_id = $1
                          ORDER BY published_at DESC LIMIT $2)`,
      [organizationId, VERSIONS_KEPT],
    );

    return { versionId: version.rows[0].id, templateKey: current.template_key };
  });
}

/** Take the site offline; content and history kept (FR-WEB-011). */
export async function unpublishWebsite(organizationId: string): Promise<boolean> {
  const row = await queryOne<{ organization_id: string }>(
    `UPDATE organization_websites SET is_live = false
      WHERE organization_id = $1 AND is_live
      RETURNING organization_id`,
    [organizationId],
  );
  return row !== null;
}

/** Make the last published snapshot live again, without re-publishing the draft. */
export async function republishWebsite(organizationId: string): Promise<boolean> {
  const row = await queryOne<{ organization_id: string }>(
    `UPDATE organization_websites SET is_live = true
      WHERE organization_id = $1 AND NOT is_live AND published_content IS NOT NULL
      RETURNING organization_id`,
    [organizationId],
  );
  return row !== null;
}

export interface WebsiteVersion {
  id: string;
  templateKey: string;
  publishedAt: Date;
}

export async function listVersions(organizationId: string): Promise<WebsiteVersion[]> {
  const rows = await query<{ id: string; template_key: string; published_at: Date }>(
    `SELECT id, template_key, published_at FROM organization_website_versions
      WHERE organization_id = $1 ORDER BY published_at DESC LIMIT $2`,
    [organizationId, VERSIONS_KEPT],
  );
  return rows.map((r) => ({ id: r.id, templateKey: r.template_key, publishedAt: r.published_at }));
}

/**
 * Restore a version INTO THE DRAFT (FR-WEB-012) — never straight to live.
 * The version id is a client choice, so it is matched together with `organization_id`:
 * another tenant's version id finds no row.
 */
export async function restoreVersion(
  organizationId: string,
  userId: string,
  versionId: string,
): Promise<boolean> {
  const row = await queryOne<{ organization_id: string }>(
    `UPDATE organization_websites w
        SET draft_content = v.content, template_key = v.template_key,
            draft_updated_at = now(), draft_updated_by = $2
       FROM organization_website_versions v
      WHERE w.organization_id = $1
        AND v.organization_id = $1
        AND v.id = $3
      RETURNING w.organization_id`,
    [organizationId, userId, versionId],
  );
  return row !== null;
}

/* ── the public read ───────────────────────────────────────────────────── */

export interface LiveSite {
  organizationId: string;
  organizationName: string;
  slug: string;
  templateKey: string;
  content: WebsiteContent;
}

/**
 * The ONLY unauthenticated read in this module. Published columns only; live sites of
 * ACTIVE organisations only. Everything else is a 404 to the caller.
 */
export async function findLiveSiteBySlug(slug: string): Promise<LiveSite | null> {
  const row = await queryOne<{
    organization_id: string;
    name: string;
    slug: string;
    published_template_key: string;
    published_content: unknown;
  }>(
    `SELECT o.id AS organization_id, o.name, o.slug,
            w.published_template_key, w.published_content
       FROM organization_websites w
       JOIN organizations o ON o.id = w.organization_id
      WHERE o.slug = $1 AND o.status = 'ACTIVE' AND w.is_live`,
    [slug],
  );
  if (!row) return null;
  const parsed = parseContent(row.published_content);
  if (!parsed.ok) return null;
  return {
    organizationId: row.organization_id,
    organizationName: row.name,
    slug: row.slug,
    templateKey: row.published_template_key,
    content: parsed.content,
  };
}
