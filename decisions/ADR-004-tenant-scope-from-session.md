# ADR-004 — Tenant scope comes from the session, and the database enforces it too

**Decision:** `organization_id` is derived from the authenticated session row and never
from client input. No endpoint accepts an organization identifier as a parameter. In
addition, org-scoped tables reference `users` by *composite* foreign key including
`organization_id`, so PostgreSQL refuses cross-tenant links independently of application
logic.

**Why:** Multi-tenant isolation cannot rest on a value the caller controls. A tenant id
in a body, query string, or path segment is forgeable, and an application-layer scope
check is a check somebody eventually omits — invisibly, because the omission looks like
ordinary code and the happy path still works.

**Alternatives considered:**

- *Client-supplied organization id, validated against the session* — the common pattern.
  Rejected: it means every endpoint must remember to validate, and the failure mode of
  forgetting is silent cross-tenant data access rather than an error.
- *PostgreSQL Row-Level Security* — genuinely strong, and enforced by the database for
  every query. Rejected for now because it requires the connection to carry the tenant as
  a session variable, which interacts badly with connection pooling, and because it moves
  authorization logic into a layer with no tests and poor local ergonomics. Worth
  revisiting if the surface grows; it would supplement this decision, not replace it.
- *Session-derived scope plus composite foreign keys* — chosen. Two independent
  mechanisms, so a mistake in one is caught by the other.

**Chosen approach:** Sessions store `organization_id` alongside `user_id`, with a
composite foreign key back to `users (id, organization_id)` keeping the denormalised copy
honest. Authorization reads scope from there.

`users` carries a redundant `UNIQUE (id, organization_id)` purely so other tables can
reference the pair. `consultant_assignments` uses it on both sides, which makes a
cross-tenant assignment *unrepresentable* rather than merely untested:

```sql
FOREIGN KEY (consultant_id, organization_id) REFERENCES users (id, organization_id)
FOREIGN KEY (customer_id,   organization_id) REFERENCES users (id, organization_id)
```

**Impact:** Every repository function touching an org-scoped table takes `organizationId`
as a required argument, with no overload that omits it. Every new org-scoped table must
carry `organization_id NOT NULL` and use the composite reference where a person is
involved — this is the pattern to copy, not a one-off for assignments. An endpoint
accepting a tenant id is a security bug, not a convenience.

This follows TempleOS ADR-004.

**Status:** Accepted

**Date:** 2026-08-21
