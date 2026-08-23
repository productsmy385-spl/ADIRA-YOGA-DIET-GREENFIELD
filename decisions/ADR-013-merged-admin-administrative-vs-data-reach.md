# ADR-013 — ADMIN is one role with organization-wide *administrative* reach and assignment-scoped *member data* reach

**Decision:** `ORG_OWNER` and `ADMIN` merge into a single tenant role, `ADMIN`. That role
carries **organization-wide administrative authority** and **assignment-scoped access to
member health and activity data**. The two reaches are separate permissions and must
never be conflated. `CUSTOMER` is renamed `USER`. The platform domain
(`PLATFORM_OWNER` / `owner_accounts`) is renamed `SUPER_ADMIN` and is otherwise unchanged.

**Status:** Accepted

**Date:** 2026-08-23

**Supersedes:** the role ladder half of [ADR-002](ADR-002-combined-admin-consultant.md).
ADR-002's *security* rule — that a consultant reaches only assigned customers — is
**retained and extended**, not reversed. ADR-002 is marked superseded only in respect of
the three-tier tenant ladder.

---

## Why

The user's new brief merges Owner and Admin into one operational role. Read naively, that
is the alternative ADR-002 explicitly rejected on 2026-08-21:

> *Combined and org-wide* — rejected: it makes every consultant able to read every
> customer's health record in the organization, and quietly deletes a stated security
> requirement.

The stated requirement is the Master Knowledge Base §35.5, *"Admin cannot access
unauthorized customers"*. The new brief's own §19.5 repeats it as *"Admin can access only
authorized members"*.

Both documents therefore agree, and the apparent conflict comes from one word doing two
jobs. "Access" in §2 means *administer the organization*; "access" in §19.5 means *read a
member's health record*. Splitting them resolves the conflict without weakening anything:

> **Administrative reach is organization-wide. Member health and activity data access
> remains assignment-scoped.**

That sentence is the whole decision. It is quoted verbatim into `docs/RBAC.md` and
`docs/SECURITY.md` because the ambiguity it removes is the one that caused this ADR.

## The danger this ADR exists to prevent

The obvious implementation of "merge Owner into Admin" is one line:

```ts
export function hasOrganizationWideReach(actor: TenantActor): boolean {
  return actor.role === "ADMIN";   // WRONG
}
```

That single change exposes every member's health record to every admin in the
organization and deletes a requirement stated in two separate source documents. Nothing
fails, no test breaks that is not also updated at the same time, and the loss is invisible
in review. **`hasOrganizationWideReach` must be split into two functions** so that the
mistake is not expressible:

```ts
canAdministerOrganization(actor)   // true for ADMIN — members, access requests, settings
canReadMemberData(actor, memberId) // ADMIN only via consultant_assignments; USER only self
```

## The RBAC matrix

`✔` allowed · `✖` denied · `A` allowed only for members assigned to this admin · `self`
own records only

| Capability | SUPER_ADMIN | ADMIN | USER |
|---|:--:|:--:|:--:|
| **Platform** | | | |
| Create / suspend organizations | ✔ | ✖ | ✖ |
| Create / suspend / deactivate ADMIN accounts | ✔ | ✖ | ✖ |
| Platform configuration and analytics | ✔ | ✖ | ✖ |
| **Organization administration** (org-wide) | | | |
| Review / approve / reject access requests | ✖ | ✔ | ✖ |
| Create USER accounts | ✖ | ✔ | ✖ |
| Suspend / deactivate USER accounts | ✖ | ✔ | ✖ |
| List members of the organization (identity only) | ✖ | ✔ | ✖ |
| Organization settings, join code | ✖ | ✔ | ✖ |
| Assign a member to an admin | ✖ | ✔ | ✖ |
| **Member health & activity data** (assignment-scoped) | | | |
| Read activities, check-ins, progress, reports | ✖ | **A** | self |
| Read / assign yoga and diet plans | ✖ | **A** | self (read) |
| Read appointments, consultation notes | ✖ | **A** | self |
| **Own** | | | |
| Read / update own profile | ✔ | ✔ | ✔ |
| Read audit logs | ✔ (platform) | ✔ (own org) | ✖ |

Three rows deserve emphasis:

- **SUPER_ADMIN is `✖` on every member-data row.** ADR-001 gives platform accounts no
  implicit reach into tenant data, and `canActOn` deliberately provides no code path by
  which a platform principal gains authority over a tenant user. Privileged support access,
  if ever needed, arrives as a separate, individually audited capability — not by relaxing
  this table.
- **ADMIN is `✔` on "list members" but `A` on health data.** An admin can see that a
  member exists, and administer their account, without being able to read their practice.
  This is the merge working as intended.
- **ADMIN is `✖` on the ADMIN lifecycle rows.** See Q1 below.

## Q1 — an ADMIN may not administer another ADMIN

Confirmed by the user. `canActOn` requires the actor to strictly outrank the target, so
after the merge all admins are peers and none can act on another. **This is kept, not
worked around.**

- `SUPER_ADMIN` creates, suspends, and deactivates `ADMIN` accounts.
- `ADMIN` creates, suspends, and deactivates `USER` accounts.

The rank rule therefore needs no change at all: `rankOf(ADMIN) <= rankOf(ADMIN)` already
denies. The temptation to relax the comparison to `<` for "just this one case" must be
resisted — it would also let a user act on a peer user, which is the invariant the
strictness exists to protect (CLAUDE.md invariant 4).

`canAssignRole` is likewise already correct: an `ADMIN` cannot grant `ADMIN`, which is
exactly right now that admin provisioning is a Super Admin duty.

## Q2 — access requests target an organization by join code, never by a dropdown

Confirmed by the user. `001_foundation.sql` already reasoned this out for signup:

> A public dropdown would publish the customer list and let anyone queue a PENDING row
> against any tenant they can see.

The public form therefore collects a **join code** plus applicant details, and the backend
resolves code → organization. No endpoint returns a list of organizations to an
unauthenticated caller, and an invalid code must be rejected without revealing whether any
organization exists. Invitation URLs may carry the code as a parameter.

This makes `join_code` load-bearing rather than vestigial, which settles the earlier open
question about whether it survives: it does.

## Q3 — every organization must keep at least one ACTIVE admin

Confirmed by the user. Dropping `users_one_org_owner_idx` removes the database's guarantee
that an organization has an identifiable principal, so the guarantee moves up a layer and
becomes a rule about *active administrators* rather than about a single owner.

- An `ADMIN` may not suspend or deactivate the **last active** `ADMIN` of an organization,
  including themselves.
- The check runs **server-side inside the same transaction as the status change**. A
  check-then-write outside a transaction races: two admins suspending each other
  concurrently both read "two active admins" and both proceed, leaving zero. The
  implementation must `SELECT ... FOR UPDATE` the organization's admin rows, or re-assert
  the count in the `UPDATE`'s `WHERE` clause.
- `SUPER_ADMIN` may override, because platform-level recovery must remain possible when an
  organization has locked itself out.
- The UI must explain *why* the action is unavailable. A disabled button with no reason is
  a support ticket; and a disabled button is not the enforcement — the transaction is.

## Q6 — "Needs Attention" is operational, never clinical

Confirmed by the user, and it settles the `[proposed]` marker `docs/METRICS.md` carries
against `assessAttention`.

Permitted signals, all objective and all derivable from rows the system already holds:

- missed activity
- repeated incomplete activity
- pending admin review
- plan change awaiting acknowledgement
- unresolved appointment
- report awaiting review

Forbidden: diagnosis, inference of medical deterioration, clinical risk scoring, treatment
recommendation, or any automated clinical judgement.

The distinction is visible in the wording the UI uses. **"3 scheduled activities were
missed"** states a fact the database can prove. **"Customer health is deteriorating"** is a
clinical claim this product is not qualified to make and must never render.

`assessAttention` and every string it drives are audited against this list in
`US-ATTENTION-AUDIT`.

## Migration strategy — three deployments, not one

Railway runs `npm run migrate` as `preDeployCommand`, so migrations apply **while the old
container is still serving**. A one-shot rename breaks the running application. Forward-only
migrations (ADR-006) mean there is no rollback, so the sequence must be safe at every step.

### Deployment 1 — additive only

`006_role_model_additive.sql`

- `ALTER TYPE tenant_role ADD VALUE 'USER'` — added, **not used** in this migration.
  PostgreSQL forbids using a new enum label before its transaction commits (CLAUDE.md
  invariant 6), which is why the backfill cannot live here.
- Create `access_requests` (see below). Independent of the role change and safe to land now.

Code in this deployment **reads both** `CUSTOMER` and `USER`, and still writes `CUSTOMER`.
The old container continues to work throughout.

### Deployment 2 — backfill and switch

`007_role_model_backfill.sql`

- Seed `consultant_assignments` for every existing `ORG_OWNER` (see below) — **before**
  the role changes, so no window exists in which an admin has neither org-owner reach nor
  assignments.
- `UPDATE users SET role = 'ADMIN' WHERE role = 'ORG_OWNER'`
- `UPDATE users SET role = 'USER' WHERE role = 'CUSTOMER'`
- `DROP INDEX users_one_org_owner_idx` — only now, once no row holds `ORG_OWNER`.

Code in this deployment writes the new values and implements the split reach functions.

### Deployment 3 — cleanup, later

`008_role_model_cleanup.sql`, only once nothing in production references the dead labels.
PostgreSQL cannot drop an enum value, so removing `ORG_OWNER` and `CUSTOMER` means
recreating `tenant_role` and rewriting the column. **This is optional.** Leaving two unused
labels costs nothing but tidiness; recreating a type under a live application costs a table
rewrite. Recommendation: defer indefinitely, and document the labels as tombstones.

## Assignment migration — the existing administrator must not go blind

Production holds exactly one `ORG_OWNER` (the operator's own account) with **zero**
`consultant_assignments`. A blind rename gives it `ADMIN` with assignment-scoped data
reach and therefore **no visible members at all** — a self-inflicted outage on the only
real account in the system.

Three options were considered:

| Option | Verdict |
|---|---|
| Grant `ADMIN` org-wide data reach | **Rejected.** This is the security failure the whole ADR exists to prevent. Solving a migration problem by deleting the invariant is not solving it. |
| Leave the account with no assignments and let it re-assign itself | **Rejected.** It cannot: reading a member to assign them is itself a data read. The account would be locked out of its own organization. |
| **Seed assignments during migration** | **Chosen.** Explicit, auditable, and preserves the invariant. |

`007_role_model_backfill.sql` therefore inserts, for each migrating `ORG_OWNER`, an active
`consultant_assignments` row to every `CUSTOMER`/`USER` in that organization that they do
not already have. This is a **statement of the access they already held**, not a grant of
new access — before the migration an `ORG_OWNER` could read every member by definition, so
the assignments record precisely what was already true. Each insert is written to
`audit_logs` with `action = 'assignment.migrated'` so the trail shows why they exist.

This is a one-off. New admins created after the migration start with no assignments and
receive them deliberately.

## `access_requests`

Separate from account status, per brief §8. An access request is not an account, and
`account_status.PENDING` — currently documented as "self-registered via join code, awaiting
approval" — is retired rather than reused, because it is precisely the mixing the brief
warns against.

```
access_requests
  id                uuid pk
  organization_id   uuid not null → organizations(id)   -- resolved from join_code, never client-supplied
  full_name         text not null
  email             text not null                       -- lower(email) checked
  phone             text
  reason            text
  status            access_request_status not null default 'PENDING'
  reviewed_by       uuid → users(id)                    -- composite FK with organization_id
  reviewed_at       timestamptz
  review_notes      text
  created_ip        inet
  created_at        timestamptz not null default now()
  updated_at        timestamptz not null default now()
```

`CREATE TYPE access_request_status AS ENUM ('PENDING','APPROVED','REJECTED','CANCELLED')`

- **Duplicate handling** is a partial unique index —
  `UNIQUE (organization_id, email) WHERE status = 'PENDING'` — not an application check,
  which races.
- **`reviewed_by`** carries a composite foreign key including `organization_id`, so
  PostgreSQL refuses a reviewer from another tenant regardless of application logic. This
  is the same technique `consultant_assignments` uses.
- **No role column.** The applicant cannot express a desired role; approval always creates
  `USER` / `INVITED`. Admin provisioning is a separate privileged workflow.

## Routes

One authentication system, one entry point. Brief §16 forbids a parallel auth path, and
admins and users are the same rows in `users` behind the same cookie.

| Path | Purpose |
|---|---|
| `/sign-in` | the only tenant sign-in. Routes by role after authentication. |
| `/request-access` | public form, join code required |
| `/dashboard` | USER |
| `/admin` | ADMIN |
| `/super-admin` | SUPER_ADMIN (renamed from `/owner`) |
| `/super-admin/sign-in` | **new** — the platform domain has its own cookie, table, and secret, so a separate page is correct here and is currently missing entirely |

`/admin/login` is **not** built. A separate admin login page would duplicate the auth
surface and reveal which addresses are admins.

## Impact

- `hasOrganizationWideReach` is deleted and replaced by two functions. Every current call
  site must be revisited deliberately — there are 12 source files referencing `ORG_OWNER`.
- Existing tests encode the three-tier ladder and will be rewritten, not renamed.
  `tests/caseload-scope.test.ts` and `tests/tenant-isolation.test.ts` are the significant
  ones.
- `docs/RBAC.md`, `SECURITY.md`, `DATABASE.md`, `ARCHITECTURE.md`, `ROADMAP.md`,
  `KNOWLEDGE-MAP.md` and `BMAD/STATUS.md` all describe the old ladder and must be updated
  in the same change.
- The 16 security tests in the brief's §19 are integration tests and cannot run against
  production. `adira_test` exists on the same server, fully migrated, and is the correct
  target.

## What this does not decide

- Q3 and Q6 above.
- Whether `ADMIN` should later split back into distinct administrator and consultant tiers.
  ADR-002 noted that `consultant_assignments` survives such a split unchanged; that remains
  true, which is what makes this direction safe to take.
- Any billing capability. Out of scope for MVP, per the user's scope decision.
