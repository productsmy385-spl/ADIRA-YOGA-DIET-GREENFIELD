# Test plan — role model merge, access requests, account provisioning

**Status:** planned. **No test in this document has been executed.**
**Date:** 2026-08-23
**Governs:** [ADR-013](../../decisions/ADR-013-merged-admin-administrative-vs-data-reach.md),
[EPIC-ROLE-MODEL-MERGE](../05-epics-and-stories/EPIC-ROLE-MODEL-MERGE.md)

Every case below is `READY — NOT EXECUTED`. Integration cases additionally carry the
precondition in §2, which is not yet satisfied.

---

## 1. What this plan is defending

One sentence, because every case here exists to protect it:

> **Administrative reach is organization-wide. Member health and activity data access
> remains assignment-scoped.**

The failure this plan is built to catch is not a crash. It is a silent widening — an
`ADMIN` gaining read access to an unassigned member's health record because someone made
`hasOrganizationWideReach` return `true`. Nothing throws, no page breaks, and the loss is
invisible in review. **SEC-03 is the single most important case in this document**; if it
passes while the merge is implemented wrongly, the plan has failed.

## 2. Execution preconditions — currently UNMET

Integration cases run `TRUNCATE` on every table via `tests/helpers/sql-db.ts`. They must
never touch production.

| # | Precondition | State |
|---|---|---|
| P1 | `SQL_TEST_DATABASE_URL` points at `adira_test`, **not** `railway` | configured 2026-08-23, **not yet verified by a run** |
| P2 | `adira_test` is confirmed a different `current_database()` from production | verified 2026-08-23 — separate DB, own `schema_migrations`, 5 migrations applied |
| P3 | Migrations `006`/`007` applied to `adira_test` | **not done — migrations do not exist yet** |
| P4 | A run has been observed leaving production row counts unchanged | **not done** |

**Do not execute any `[INT]` case until P3 and P4 are satisfied.** P4 matters because this
project has twice had `SQL_TEST_DATABASE_URL` silently re-pointed at production; the
guard is a verified observation, not a configuration value.

## 3. Legend

`[UNIT]` pure, no database — runs today
`[INT]` integration, needs `adira_test`
`[UI]` component test under jsdom
`[MIG]` migration behaviour, run against a seeded copy

---

## 4. RBAC — the merged role

| ID | Case | Type | Story |
|---|---|---|---|
| RBAC-01 | `rankOf` ladder is `USER < ADMIN`; `SUPER_ADMIN` is not on the tenant ladder at all | UNIT | US-RBAC-MERGE |
| RBAC-02 | `canAdministerOrganization(ADMIN)` is true; `(USER)` is false | UNIT | US-ADMIN-ADMINISTRATIVE |
| RBAC-03 | `canReadMemberData(ADMIN, member)` is **false** without an assignment | UNIT | US-ASSIGNMENT-SCOPE |
| RBAC-04 | `canReadMemberData(ADMIN, member)` is **true** with an active assignment | UNIT | US-ASSIGNMENT-SCOPE |
| RBAC-05 | `canReadMemberData(USER, self)` true; `(USER, other)` false | UNIT | US-USER-ISOLATION |
| RBAC-06 | `hasOrganizationWideReach` no longer exists — a grep-level assertion that the old, conflating function is gone | UNIT | US-RBAC-MERGE |
| RBAC-07 | `canActOn(ADMIN, ADMIN)` denies with `INSUFFICIENT_RANK` | UNIT | US-ADMIN-LIFECYCLE |
| RBAC-08 | `canActOn(ADMIN, USER)` allows within the same organization | UNIT | US-ADMIN-ADMINISTRATIVE |
| RBAC-09 | `canActOn` denies `CROSS_ORGANIZATION` before any rank comparison | UNIT | US-ORG-ISOLATION |
| RBAC-10 | `canAssignRole(ADMIN, 'ADMIN')` denies — admin provisioning is Super Admin's | UNIT | US-ADMIN-LIFECYCLE |
| RBAC-11 | `canAssignRole(anyone, 'SUPER_ADMIN')` denies with `UNGRANTABLE_ROLE` | UNIT | US-SUPERADMIN-ISOLATION |
| RBAC-12 | An assignment that has `ended_at` set does **not** grant read access | INT | US-ASSIGNMENT-SCOPE |

## 5. Security — the brief's §19, mapped

The user's brief lists 16 required security tests. Each maps to a case here. Numbering
follows the brief so nothing is silently dropped.

| Brief § | ID | Case | Type |
|---|---|---|---|
| 1 | SEC-01 | ADMIN can perform organization-wide administrative operations (list members, review requests) | INT |
| 2 | **SEC-03** | **ADMIN cannot read an unassigned member's activities, check-ins, progress, plans, reports, or appointments** | INT |
| 3 | SEC-04 | ADMIN can read an assigned member's authorized data | INT |
| 4 | SEC-05 | ADMIN cannot reach any member of another organization | INT |
| 5 | SEC-06 | ADMIN cannot suspend another ADMIN | INT |
| 6 | SEC-07 | SUPER_ADMIN can create, suspend, and deactivate ADMIN accounts | INT |
| 7 | SEC-08 | SUPER_ADMIN reading member health data is denied — no implicit reach | INT |
| 8 | SEC-09 | USER can read own activities, check-ins, progress, reports | INT |
| 9 | SEC-10 | USER cannot read another USER, in the same organization or any other | INT |
| 10 | SEC-11 | The public access-request endpoint never returns an organization list or count | INT |
| 11 | SEC-12 | An invalid `join_code` is rejected, and indistinguishably from a valid code for a suspended organization | INT |
| 12 | SEC-13 | An applicant cannot express a role; a submitted `role` field is ignored, not honoured | INT |
| 13 | SEC-14 | A `PENDING` access request grants no session and no application access | INT |
| 14 | SEC-15 | A `REJECTED` request cannot be activated, and approving it after rejection fails | INT |
| 15 | SEC-16 | The migrated legacy ORG_OWNER retains access to the members it previously could see | MIG |
| 16 | SEC-17 | No organization administrator is left with zero visible members after migration | MIG |

Additional cases the brief implies but does not enumerate:

| ID | Case | Type |
|---|---|---|
| SEC-18 | IDOR: `GET /api/users/<other-id>` as USER returns 403, not 404-with-timing-difference | INT |
| SEC-19 | BOLA: changing `organization_id` in a request body does not change the scope actually queried — scope comes from the session (ADR-004) | INT |
| SEC-20 | A USER cannot modify their own `role` through any write path | INT |
| SEC-21 | A `SUSPENDED` user's existing session stops resolving on the next request, with no sweep | INT |
| SEC-22 | A tenant session token does not authenticate against the platform domain, and vice versa (ADR-011 keyed hashes) | UNIT |

## 6. Last-active-admin protection (Q3)

| ID | Case | Type |
|---|---|---|
| ADMIN-01 | Suspending an ADMIN succeeds while another ACTIVE admin remains | INT |
| ADMIN-02 | Suspending the **last** ACTIVE admin is refused | INT |
| ADMIN-03 | An admin cannot deactivate **themselves** when they are the last active one | INT |
| ADMIN-04 | **Concurrency:** two admins suspending each other simultaneously cannot both succeed. Run both in overlapping transactions and assert at least one ACTIVE admin survives. | INT |
| ADMIN-05 | SUPER_ADMIN may override and suspend the last admin — platform recovery must stay possible | INT |
| ADMIN-06 | The refusal carries a reason the UI can render, not a bare boolean | UNIT |

ADMIN-04 is the case that matters. A check-then-write outside a transaction passes
ADMIN-02 and still leaves an organization with zero admins under concurrency.

## 7. Access requests

| ID | Case | Type |
|---|---|---|
| REQ-01 | A valid join code resolves to its organization and creates a `PENDING` request | INT |
| REQ-02 | An unknown join code is rejected without revealing whether any organization exists | INT |
| REQ-03 | A join code for a `SUSPENDED` or `CLOSED` organization is rejected identically to an unknown one | INT |
| REQ-04 | A second `PENDING` request for the same (organization, email) is refused by the partial unique index, not by application logic | INT |
| REQ-05 | A new request is permitted once a prior one is `REJECTED` or `CANCELLED` | INT |
| REQ-06 | Submissions are rate-limited per IP and per email; the limiter fails **closed** when the count cannot be read | INT |
| REQ-07 | Malformed input is rejected with field-level errors and no partial row | INT |
| REQ-08 | Approval creates exactly one `users` row, `role = USER`, `status = INVITED`, in one transaction with the request status change | INT |
| REQ-09 | Approval by an admin of a **different** organization is refused | INT |
| REQ-10 | Rejection writes `reviewed_by`, `reviewed_at`, and `review_notes`, and creates no user row | INT |
| REQ-11 | Approving an already-`APPROVED` request is idempotent — it does not create a second account | INT |
| REQ-12 | An approved applicant activates through the **existing** OTP/passkey flow; no new credential type exists | INT |
| REQ-13 | `access_requests` never stores a credential, and `reviewed_by` is refused across tenants by the composite foreign key | INT |

## 8. Migration

| ID | Case | Type |
|---|---|---|
| MIG-01 | `006` adds `USER` to `tenant_role` and uses it nowhere — asserts the enum/transaction rule of CLAUDE.md invariant 6 | MIG |
| MIG-02 | Code deployed with `006` reads both `CUSTOMER` and `USER` | UNIT |
| MIG-03 | `007` seeds assignments for every migrating ORG_OWNER **before** changing any role | MIG |
| MIG-04 | After `007`, no row holds `ORG_OWNER` or `CUSTOMER` | MIG |
| MIG-05 | `users_one_org_owner_idx` is dropped only after MIG-04 holds | MIG |
| MIG-06 | Every seeded assignment is written to `audit_logs` as `assignment.migrated` | MIG |
| MIG-07 | Existing `audit_logs` rows naming the old roles are left untouched — history is not rewritten | MIG |
| MIG-08 | Re-running `007` is a no-op, not a duplicate-assignment error | MIG |
| MIG-09 | Migration checksums verify; no applied migration was edited (ADR-006) | UNIT |

## 9. Needs Attention (Q6)

| ID | Case | Type |
|---|---|---|
| ATT-01 | Every signal `assessAttention` can emit is drawn from the permitted operational list | UNIT |
| ATT-02 | No rendered string implies diagnosis, deterioration, clinical risk, or treatment | UNIT |
| ATT-03 | A flagged member renders an objective count — "3 scheduled activities were missed" | UI |
| ATT-04 | Status is never conveyed by colour alone | UI |

## 10. UI

| ID | Case | Type |
|---|---|---|
| UI-01 | The access-request form renders loading, success, and field-error states | UI |
| UI-02 | The form is usable at 320 px and at desktop width | UI |
| UI-03 | The admin request queue renders as a table on desktop and as cards on mobile | UI |
| UI-04 | Approve and reject each require an explicit confirmation step | UI |
| UI-05 | The last-admin refusal explains why, rather than presenting a dead control | UI |
| UI-06 | After sign-in, each role lands on its own surface from the single `/sign-in` entry point | INT |

## 11. Regression

| ID | Case | Type |
|---|---|---|
| REG-01 | Existing OTP sign-in continues to work end to end | INT |
| REG-02 | Existing passkey registration and authentication continue to work | INT |
| REG-03 | `/today` daily loop is unaffected for a USER | INT |
| REG-04 | The nightly missed-activity sweep is unaffected | INT |
| REG-05 | Full unit suite stays green — currently 286 passing | UNIT |

---

## 12. Counts

| Type | Cases |
|---|---|
| `[UNIT]` | 22 |
| `[INT]` | 45 |
| `[MIG]` | 9 |
| `[UI]` | 8 |
| **Total planned** | **84** |

All **84 are `READY — NOT EXECUTED`.**

## 13. Exit criteria

This work is not done until every case above passes, `npm run typecheck`, `npm run lint`
and `npm run build` are clean, and **P4 has been observed** — a full integration run that
leaves production row counts unchanged.

Compilation is not evidence. The brief's §24 says so explicitly, and this project has
already shipped one bug (`resolveLocale` returning an unrenderable locale) that every unit
test passed straight through.
