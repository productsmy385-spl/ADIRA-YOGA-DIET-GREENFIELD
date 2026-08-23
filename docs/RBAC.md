# Roles and authorization

## The rule everything else serves

> **Administrative reach is organization-wide. Member health and activity data access
> remains assignment-scoped.**

Quoted verbatim from [ADR-013](../decisions/ADR-013-merged-admin-administrative-vs-data-reach.md),
because the ambiguity it removes is the one that made that decision necessary. "Access"
means two different things in the brief — administer the organization, and read a member's
health record — and conflating them hands every admin every member's practice.

## Two identity domains

| Domain | Principal | Table | Session | Scope |
|---|---|---|---|---|
| `PLATFORM` | `SUPER_ADMIN` | `owner_accounts` | `owner_sessions`, own cookie + secret | all organizations |
| `TENANT` | `ADMIN`, `USER` | `users` | `sessions`, own cookie + secret | exactly one organization |

`owner_accounts` has **no** `organization_id` column and `users` has a **NOT NULL** one.
Neither mistake — an unscoped tenant user, a tenant-scoped platform account — is
representable. (ADR-001)

## The tenant ladder

```
ADMIN  (20)   organization-wide ADMINISTRATION
              assignment-scoped MEMBER DATA
USER   (10)   self only
```

Ranks are relative only. They are never persisted; the database stores the role name.

`SUPER_ADMIN` is not on this ladder. It belongs to the other identity domain, and there is
no rung connecting them.

### The two reaches, and why they are two functions

`hasOrganizationWideReach()` **no longer exists.** It answered both questions with one
boolean, which meant merging `ORG_OWNER` into `ADMIN` could be done by flipping it — a
one-line change that would have exposed every member's health record while nothing failed
and no test went red.

| Function | Answers | True for |
|---|---|---|
| `canManageOrganization(actor)` | may they administer this organization? | `ADMIN` |
| `canAccessMemberData(actor, member, hasAssignment)` | may they read this member's practice? | `ADMIN` **with an active assignment**; `USER` for themselves |

`resolveMemberAccess` in `src/server/authorization/member-access.ts` is the single gate
that performs the assignment lookup and returns a reasoned decision. Every read of
activities, check-ins, progress, plans, reports, or appointments goes through it.

A denial for a **named** member is 403 with a `DENIED` audit row — never an empty page. An
empty list is indistinguishable from "this member has no data" and hides exactly the
probing `audit_logs_denied_idx` exists to surface. For a **collection**, returning only
the authorised rows is the honest answer.

### Legacy roles during the migration window

`tenant_role` still accepts `ORG_OWNER` and `CUSTOMER`: PostgreSQL cannot drop an enum
value. `normaliseRole` maps them onto the merged model at the session boundary, and
`TenantActor.storedRole` carries the raw value.

One transitional rule reads it. A pre-migration `ORG_OWNER` keeps organization-wide member
data reach until migration `007` seeds their assignments, because the code deploys before
the migration runs and withdrawing that reach in between would leave the only real
administrator unable to see any member of their own organization.
`isLegacyOrganizationOwner` names it so deployment 3 can delete it with the compiler's
help. It grants nothing new and is still refused across organizations.

### An ADMIN may not administer another ADMIN

All admins are peers, and `canActOn` requires the actor to **strictly** outrank the target,
so peer-on-peer is denied with `INSUFFICIENT_RANK`. This is kept rather than worked around
(ADR-013 Q1): `SUPER_ADMIN` owns the `ADMIN` lifecycle, `ADMIN` owns the `USER` lifecycle.

Relaxing the comparison to `<` for "just this case" would also let a `USER` act on a peer
`USER`, which is the invariant the strictness protects.

### An organization must keep one active admin

`users_one_org_owner_idx` guaranteed an identifiable principal per organization. Migration
`007` drops it, so the guarantee moves to `setMemberStatus`, which refuses to suspend or
deactivate the last `ACTIVE` admin — inside a transaction, locking the admin rows
`FOR UPDATE` before counting. A check-then-write races: two admins suspending each other
concurrently both see two and both proceed. `SUPER_ADMIN` may override, because platform
recovery must stay possible. (ADR-013 Q3)

## The two rank rules

`src/server/authorization/permissions.ts`, both pure and exhaustively tested.

### `canActOn(actor, target)`

May the actor administer this person — disable, change role, reset credentials, remove?

Checked in order, and the order matters:

1. Both must be tenant principals → else `CROSS_DOMAIN`
2. Same organization → else `CROSS_ORGANIZATION`
3. Not oneself → else `SELF_ACTION`
4. Actor strictly outranks target → else `INSUFFICIENT_RANK`

Organization is checked *before* rank so a cross-tenant probe is always reported as
`CROSS_ORGANIZATION`, never disguised as a rank problem. That distinction is the signal
worth alerting on.

### `canAssignRole(actor, role)`

1. `SUPER_ADMIN` is refused outright → `UNGRANTABLE_ROLE`
2. Actor must be a tenant principal → else `CROSS_DOMAIN`
3. Actor strictly outranks the role → else `INSUFFICIENT_RANK`

**Strictly**, not `>=`. Peers acting on peers is exactly how one compromised admin
account locks the real ones out.

### Two consequences that look like bugs

- **An `ADMIN` cannot grant `ADMIN`.** After ADR-013 that is exactly right: provisioning
  an administrator is `SUPER_ADMIN`'s job, not something reached by mis-clicking a select
  on the members table.

- **`SUPER_ADMIN` is ungrantable at any rank.** It is not a senior rung on this ladder; it
  is a different ladder in a different table. There is no rung to climb.

## SUPER_ADMIN does not bypass authorization

`canActOn` never grants a `SUPER_ADMIN` authority over a tenant user — it returns
`CROSS_DOMAIN`, and `canAccessMemberData` refuses platform principals outright, so no
amount of assignment data would help. Platform-level intervention exists, but as a separate, individually
audited operation, not as a silent fall-through in a rank check.

This is deliberate. "Owner must not automatically bypass authorization" is a requirement,
and the way to honour it is to give the bypass no code path at all rather than to write
one and trust every future caller to log it.

## Denial reasons

Decisions return a reason rather than a bare boolean, so a refused privileged action can
be logged with *why*.

| Reason | Meaning |
|---|---|
| `CROSS_DOMAIN` | platform/tenant boundary crossed |
| `CROSS_ORGANIZATION` | different tenants — **security signal** |
| `INSUFFICIENT_RANK` | actor does not strictly outrank |
| `SELF_ACTION` | actor is the target |
| `UNGRANTABLE_ROLE` | role not grantable through this surface |
| `NOT_ASSIGNED` | no active `consultant_assignments` row links actor to member |

`CROSS_ORGANIZATION`, `UNGRANTABLE_ROLE`, and a repeated `NOT_ASSIGNED` mean someone is
probing a boundary. They are
written to `audit_logs` with `outcome = 'DENIED'`, which has its own partial index.

## Still to build

Phase 3 owns the enforcement layer that consumes these rules: route guards, the
`consultant_assignments` lookup, and the cross-tenant/IDOR suites named in
`docs/TESTING.md`. Phase 0 delivered the rules and their unit tests only.
