# Roles and authorization

## Two identity domains

| Domain | Principal | Table | Session | Scope |
|---|---|---|---|---|
| `PLATFORM` | `PLATFORM_OWNER` | `owner_accounts` | `owner_sessions`, own cookie + secret | all organizations |
| `TENANT` | `ORG_OWNER`, `ADMIN`, `CUSTOMER` | `users` | `sessions`, own cookie + secret | exactly one organization |

`owner_accounts` has **no** `organization_id` column and `users` has a **NOT NULL** one.
Neither mistake — an unscoped tenant user, a tenant-scoped platform account — is
representable. (ADR-001)

## The tenant ladder

```
ORG_OWNER  (30)   organization-wide reach
ADMIN      (20)   assigned customers only  ← combined admin/consultant role
CUSTOMER   (10)   self only
```

Ranks are relative only. They are never persisted; the database stores the role name.

### ADMIN is assignment-scoped

`ADMIN` merges the admin and consultant roles (ADR-002). It reaches the customers listed
in `consultant_assignments` and no others. `hasOrganizationWideReach()` returns `false`
for `ADMIN`, and a `false` there does not mean "denied" — it means the caller must
additionally consult `consultant_assignments` before returning a customer record.

Organization-wide reach belongs to `ORG_OWNER` alone.

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

1. `PLATFORM_OWNER` is refused outright → `UNGRANTABLE_ROLE`
2. Actor must be a tenant principal → else `CROSS_DOMAIN`
3. Actor strictly outranks the role → else `INSUFFICIENT_RANK`

**Strictly**, not `>=`. Peers acting on peers is exactly how one compromised admin
account locks the real ones out.

### Two consequences that look like bugs

- **An `ORG_OWNER` cannot grant `ORG_OWNER`.** Ownership transfer is therefore not a
  dropdown on the users table. Handing over an organization is a deliberate, separately
  audited operation — not something reached by mis-clicking a select.

- **`PLATFORM_OWNER` is ungrantable at any rank.** It is not a senior rung on this
  ladder; it is a different ladder in a different table. There is no rung to climb.

## The platform owner does not bypass authorization

`canActOn` never grants a `PLATFORM_OWNER` authority over a tenant user — it returns
`CROSS_DOMAIN`. Platform-level intervention exists, but as a separate, individually
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

`CROSS_ORGANIZATION` and `UNGRANTABLE_ROLE` mean someone is probing a boundary. They are
written to `audit_logs` with `outcome = 'DENIED'`, which has its own partial index.

## Still to build

Phase 3 owns the enforcement layer that consumes these rules: route guards, the
`consultant_assignments` lookup, and the cross-tenant/IDOR suites named in
`docs/TESTING.md`. Phase 0 delivered the rules and their unit tests only.
