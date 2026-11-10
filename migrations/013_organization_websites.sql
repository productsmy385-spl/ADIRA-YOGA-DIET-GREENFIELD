-- 013 — Tenant public websites (BMAD/02-product/WEBSITE-BUILDER-PRD.md, approved 2026-11-10).
--
-- One row per organisation holding TWO copies of one content document:
--   draft_content       what the editor writes, autosaved, never public
--   published_content   what /s/<slug> serves, changed only by an explicit Publish
-- so a bad edit can never take the live site down, and switching template rewrites
-- `template_key` alone — content is shared by all templates.
--
-- ADDITIVE. Two new tables; no existing row or column changes.

CREATE TABLE organization_websites (
  -- The organisation IS the key: exactly one website per tenant, by construction.
  organization_id         uuid        PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,

  template_key            text        NOT NULL CHECK (template_key ~ '^[a-z][a-z0-9-]{1,31}$'),
  draft_content           jsonb       NOT NULL,
  draft_updated_at        timestamptz NOT NULL DEFAULT now(),
  draft_updated_by        uuid,

  published_template_key  text        CHECK (published_template_key IS NULL
                                             OR published_template_key ~ '^[a-z][a-z0-9-]{1,31}$'),
  published_content       jsonb,
  published_at            timestamptz,
  published_by            uuid,

  -- Unpublish flips this and keeps the content; republish needs no re-entry.
  is_live                 boolean     NOT NULL DEFAULT false,

  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),

  -- Live requires something to serve. Stops a row that says "live" with nothing in it.
  CONSTRAINT organization_websites_live_needs_content
    CHECK (NOT is_live OR (published_content IS NOT NULL AND published_template_key IS NOT NULL)),

  -- Composite keys (ADR-004): the editor and publisher must be users OF THIS organisation.
  -- SET NULL on the user column only, so deleting a user never orphans the website row.
  CONSTRAINT organization_websites_draft_by_fk
    FOREIGN KEY (draft_updated_by, organization_id)
    REFERENCES users (id, organization_id) ON DELETE SET NULL (draft_updated_by),
  CONSTRAINT organization_websites_published_by_fk
    FOREIGN KEY (published_by, organization_id)
    REFERENCES users (id, organization_id) ON DELETE SET NULL (published_by)
);

CREATE TRIGGER organization_websites_updated_at
  BEFORE UPDATE ON organization_websites
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- The public route looks a site up by organisation, and only live ones.
CREATE INDEX organization_websites_live_idx ON organization_websites (organization_id) WHERE is_live;

CREATE TABLE organization_website_versions (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  template_key     text        NOT NULL,
  content          jsonb       NOT NULL,
  published_at     timestamptz NOT NULL DEFAULT now(),
  published_by     uuid,

  CONSTRAINT organization_website_versions_published_by_fk
    FOREIGN KEY (published_by, organization_id)
    REFERENCES users (id, organization_id) ON DELETE SET NULL (published_by)
);

CREATE INDEX organization_website_versions_org_idx
  ON organization_website_versions (organization_id, published_at DESC);
