-- 012 — Link local accounts to their Clerk identity (ADR-015).
--
-- Clerk now proves who someone is; Adira still decides what they may do. The link is
-- written once, on the first sign-in, by matching the Clerk-VERIFIED primary email to an
-- invited row. After that the row answers only to that Clerk user: a different Clerk
-- account presenting the same address is an identity conflict, not a second key.
--
-- Additive and nullable. Rows created before this migration, and invited rows nobody has
-- claimed yet, simply have no link.

ALTER TABLE users ADD COLUMN clerk_user_id text;

-- Per organization, not global. One person is one Clerk user, but Adira keeps one `users`
-- row per organization they belong to (users_email_unique_per_org), so the same Clerk id
-- legitimately appears once in each.
CREATE UNIQUE INDEX users_clerk_user_per_org_idx
  ON users (organization_id, clerk_user_id)
  WHERE clerk_user_id IS NOT NULL;

-- The platform domain stays its own table (ADR-001). A Clerk id here grants nothing in the
-- tenant domain, and a Clerk id on a `users` row grants nothing here.
ALTER TABLE owner_accounts ADD COLUMN clerk_user_id text;

CREATE UNIQUE INDEX owner_accounts_clerk_user_idx
  ON owner_accounts (clerk_user_id)
  WHERE clerk_user_id IS NOT NULL;
