# ADR-001 — Platform owners and organization owners are separate identity domains

**Decision:** Adira has two owner concepts, and they are not two roles on one ladder.
`PLATFORM_OWNER` is a principal in a separate identity domain — its own table
(`owner_accounts`), session table (`owner_sessions`), cookie, and signing secret —
spanning every organization. `ORG_OWNER` is the most senior role *inside* one
organization, an ordinary row in `users`.

**Why:** The two source documents disagreed. The written brief (§3) placed an OWNER
inside each organization; the supplied architecture poster gave OWNER "Full platform
control", an Organizations nav item, and "All Customers (All Organizations)". Both
descriptions are of something real — the operator of the SaaS, and the person who runs a
wellness studio — so the resolution was to build both rather than pick one. The user
confirmed this.

**Alternatives considered:**

- *Organization owner only* — matches the brief literally, but leaves the platform
  operator with no way to administer the platform, and no home for the `owner_accounts`
  table the brief itself lists.
- *Platform owner only* — matches the poster, but a wellness studio's proprietor then
  has the same role as the consultant they employ, which is wrong operationally.
- *One `users` table with a nullable `organization_id` and an `is_platform` flag* —
  fewer tables, but it makes two mistakes representable: an unscoped tenant user, and a
  tenant-scoped platform account. Every query would then carry a condition that is easy
  to omit and invisible in review when omitted.

**Chosen approach:** Two tables whose *column sets* enforce the boundary.
`owner_accounts` has no `organization_id` column, so a platform account cannot be scoped
to a tenant. `users.organization_id` is `NOT NULL`, so a tenant user cannot be unscoped.
Sessions are likewise two tables. `src/lib/env-schema.ts` refuses to boot if
`SESSION_SECRET` and `OWNER_SESSION_SECRET` match, since identical secrets would let a
tenant cookie be re-signed as a platform cookie.

`canActOn` in `src/server/authorization/permissions.ts` returns `CROSS_DOMAIN` for every
pairing that crosses the boundary — including platform-owner acting on a tenant user.
Platform intervention exists, but as a separate, individually audited operation, never as
a fall-through in a rank check. "Owner must not automatically bypass authorization" is
honoured by giving the bypass no code path at all.

**Impact:** Two login surfaces and two owner dashboards. No code path may upgrade a
tenant session into platform privilege; Phase 3 must add a test asserting this in both
directions. Reversing this would mean merging two tables, two session mechanisms, and two
cookies — and would reintroduce both unrepresentable-state problems.

This follows TempleOS ADR-003, which separates tenant admin sessions from platform
super-admin sessions for the same reason.

**Status:** Accepted

**Date:** 2026-08-21
