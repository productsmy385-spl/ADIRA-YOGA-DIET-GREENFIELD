# ADR-002 — ADMIN and CONSULTANT are one role, scoped by assignment

**Decision:** The tenant role ladder is `ORG_OWNER > ADMIN > CUSTOMER`. `ADMIN` is the
combined admin/consultant role. It is **not** organization-wide: it reaches the customers
listed in `consultant_assignments` and no others. Organization-wide reach belongs to
`ORG_OWNER` alone.

**Why:** The brief (§4) described a single combined "ADMIN / CONSULTANT" role; the
supplied poster showed a four-level hierarchy with Admin above Consultant. The user chose
the combined role.

That choice creates a problem that has to be solved somewhere: the brief also requires a
test that "Admin cannot access unauthorized customers" (§35). If `ADMIN` were org-wide —
the obvious reading of a merged admin role — that requirement would be untestable,
because every customer in the organization would be authorised by definition.

**Alternatives considered:**

- *Four distinct roles* (`ADMIN` org-wide, `CONSULTANT` assignment-scoped) — matches the
  poster and needs no assignment table for the admin tier, but was not chosen.
- *Combined and org-wide* — simplest permission matrix, and the reading most people would
  reach for. Rejected: it makes every consultant able to read every customer's health
  record in the organization, and quietly deletes a stated security requirement.

**Chosen approach:** `hasOrganizationWideReach()` returns `true` only for `ORG_OWNER`.
For `ADMIN` it returns `false`, which does not mean "denied" — it means the caller must
consult `consultant_assignments` before returning a customer record.

`consultant_assignments` carries composite foreign keys including `organization_id` on
both sides, so PostgreSQL refuses to link a consultant in one organization to a customer
in another regardless of what the application believes.

**Impact:** Every customer-facing read path has two shapes — org-wide for `ORG_OWNER`,
assignment-filtered for `ADMIN` — and Phase 4's repository layer must express both
without letting the assignment filter become optional. Phase 3 owes a test that an
`ADMIN` reaching an unassigned customer receives 403.

If the four-role model is later wanted, `ADMIN` splits into two: add `CONSULTANT` at rank
15 and give `ADMIN` org-wide reach. The assignment table survives that change unchanged,
which is part of why this is a safe direction to start from.

**Status:** Accepted

**Date:** 2026-08-21
