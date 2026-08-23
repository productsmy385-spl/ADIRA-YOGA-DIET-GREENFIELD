# EPIC — Role model merge, access requests, and account provisioning

**Status:** PLANNED — not started. No code, schema, or production data has been changed.
**Date:** 2026-08-23
**Decision record:** [ADR-013](../../decisions/ADR-013-merged-admin-administrative-vs-data-reach.md)
**Impact analysis:** [ROLE-MODEL-CHANGE-IMPACT](../01-analysis/ROLE-MODEL-CHANGE-IMPACT.md)
**Test plan:** [ROLE-MODEL-TEST-PLAN](../07-testing-and-review/ROLE-MODEL-TEST-PLAN.md)

---

## Epic goal

Collapse `ORG_OWNER` and `ADMIN` into a single `ADMIN` role, rename `CUSTOMER` to `USER`,
rename the platform domain to `SUPER_ADMIN`, and add a public access-request system with
admin review and account provisioning — **without widening who can read a member's health
record.**

## The invariant every story serves

> **Administrative reach is organization-wide. Member health and activity data access
> remains assignment-scoped.**

Any story that makes an `ADMIN` able to read an unassigned member's activities, check-ins,
progress, plans, reports, or appointments has failed, regardless of what else it achieves.

## Shared context

- 72 references to `ORG_OWNER` across `src/`, `tests/`, `scripts/`, `migrations/`.
- Production holds 1 organization, 1 `ORG_OWNER` (the operator, **zero assignments**),
  1 `ADMIN`, 2 `CUSTOMER`, 1 `owner_account`, 1 `consultant_assignment`.
- Railway applies migrations **before** the new container serves traffic, so the change
  spans three deployments (ADR-013).
- `adira_test` exists on the same server, fully migrated — it is the integration target.
  `SQL_TEST_DATABASE_URL` has been pointed at it but **no run has yet been observed**.

## Sequencing

```
US-SUPERADMIN-LOGIN ──────────────────────────► ships alone, closes a live gap

US-RBAC-MERGE ──┬─► US-ADMIN-ADMINISTRATIVE ──┬─► US-LAST-ADMIN
                ├─► US-ASSIGNMENT-SCOPE ───────┤
                ├─► US-USER-ISOLATION ─────────┤
                ├─► US-ORG-ISOLATION ──────────┴─► US-AUDIT-LOGGING
                └─► US-SUPERADMIN-ISOLATION

US-MIGRATE-CUSTOMER ─► US-MIGRATE-OWNER ─► US-ADMIN-LIFECYCLE

US-JOINCODE-RESOLUTION ─► US-AUTH-ACCESS-REQUEST ─► US-ADMIN-REVIEW-REQUEST
                                                 └─► US-ADMIN-CREATE-USER ─► US-ACCOUNT-ACTIVATION

US-ATTENTION-AUDIT ───────────────────────────► independent
```

---

# US-SUPERADMIN-LOGIN

## User Story
As a platform operator, I want a Super Admin sign-in page, so that the platform account
can actually be used.

## Context
`guards.ts` references `OWNER_SIGN_IN_PATH = "/super-admin/sign-in"` and **the route does
not exist**. The seeded platform account (`INVITED`) has no way to sign in at all. This is
a live gap, independent of the role merge, and ships first.

## Requirements
- `/super-admin/sign-in`, using the existing OTP flow against `owner_accounts`.
- Reuses `requestOwnerSignInCode` / `verifyOwnerSignInCode`, which already exist.
- `INVITED` promotes to `ACTIVE` on first successful verification, as the tenant path does.
- `/owner` renames to `/super-admin`.

## Acceptance Criteria
- **Given** a seeded `INVITED` platform account, **when** it verifies an emailed code,
  **then** a platform session is issued and the account becomes `ACTIVE`.
- **Given** a valid *tenant* session, **when** `/super-admin` is requested, **then** it
  redirects to sign-in — a tenant cookie must never reach the platform surface.

## Security Considerations
Separate cookie, table, and signing secret (ADR-001, ADR-011). No shared code path with
tenant sign-in that could upgrade one into the other. Enumeration-safe, as the tenant path is.

## Database Impact
None.

## API Impact
New route only.

## UI/UX Impact
New page; `/owner` → `/super-admin` redirect kept for one release.

## Migration Impact
None.

## Test Plan
REG-02, SEC-22, UI-06.

## Definition of Done
Route live, platform account able to sign in, tenant session proven unable to reach it.

## Status
DRAFT

---

# US-RBAC-MERGE

## User Story
As an architect, I want the role ladder to express the merged model, so that the
administrative/data distinction is enforceable rather than conventional.

## Context
`hasOrganizationWideReach` conflates two questions. ADR-013 requires it be **deleted** and
replaced by two functions, so the dangerous one-line change is not expressible.

## Requirements
- `TENANT_ROLES` becomes `["ADMIN", "USER"]`; ranks `ADMIN: 20`, `USER: 10`.
- `PLATFORM_ROLES` becomes `["SUPER_ADMIN"]`.
- Delete `hasOrganizationWideReach`. Add `canAdministerOrganization(actor)` and
  `canReadMemberData(actor, memberId, assignments)`.
- `canActOn` and `canAssignRole` unchanged — strict rank already produces the required
  denials (ADR-013 Q1).

## Acceptance Criteria
- **Given** an `ADMIN`, **when** `canAdministerOrganization` is called, **then** true.
- **Given** an `ADMIN` with no assignment to member M, **when** `canReadMemberData` is
  called for M, **then** false.
- **Given** the codebase, **when** searched, **then** `hasOrganizationWideReach` appears
  nowhere.

## Security Considerations
This story *is* the security control. The split exists so that "make admin org-wide" cannot
be done by editing one boolean.

## Database Impact
None — pure functions.

## API Impact
None directly; every consumer updated in dependent stories.

## UI/UX Impact
None.

## Migration Impact
Must land in the deployment that reads both old and new enum values.

## Test Plan
RBAC-01, RBAC-02, RBAC-03, RBAC-04, RBAC-05, RBAC-06, RBAC-07, RBAC-09, RBAC-10, RBAC-11.

## Definition of Done
All RBAC unit cases green; `permissions.test.ts` rewritten, not renamed.

## Status
DRAFT

---

# US-ADMIN-ADMINISTRATIVE

## User Story
As an Admin, I want organization-wide administrative authority, so that I can manage
members and requests without needing an assignment to each.

## Context
Administration is org-wide; data is not. This story implements the first half only.

## Requirements
- List members of the organization — **identity, role, status, assignment count only.**
  No activity, adherence, check-in, or plan data on the list.
- Create, suspend, deactivate `USER` accounts.
- Manage organization settings and the join code.
- Create and end assignments between an admin and a member.

## Acceptance Criteria
- **Given** an `ADMIN` with no assignments, **when** they list members, **then** every
  member of their organization is returned, with no health data.
- **Given** the same admin, **when** they open an unassigned member's activities,
  **then** 403.

## Security Considerations
The member list is the sharp edge: it is org-wide by design, so it must be audited to
carry no health data. A single joined column here silently defeats the epic.

## Database Impact
None new. Reads `users`, `consultant_assignments`.

## API Impact
Member list and member administration endpoints, all session-scoped (ADR-004).

## UI/UX Impact
Admin members list; per-member administrative actions.

## Migration Impact
None.

## Test Plan
SEC-01, RBAC-02, RBAC-08, SEC-19, SEC-20.

## Definition of Done
Admin can administer any member and read none of their health data without an assignment.

## Status
DRAFT

---

# US-ASSIGNMENT-SCOPE

## User Story
As a member, I want my health data visible only to admins assigned to me, so that
administering my account is not the same as reading my practice.

## Context
ADR-002's rule, retained and now carried by `consultant_assignments` alone.

## Requirements
- Every read of activities, check-ins, progress, plans, reports, appointments, or notes is
  filtered by an **active** assignment (`ended_at IS NULL`).
- The filter is applied in the repository's SQL, not in the caller.
- No repository function offers an "unscoped" variant for these tables.

## Acceptance Criteria
- **Given** admin A assigned to member 1 only, **when** A reads member 3's activities,
  **then** 403 and a `DENIED` audit entry.
- **Given** an assignment with `ended_at` set, **when** A reads that member, **then** 403.

## Security Considerations
The denial must be 403 with an audit row, not an empty list. An empty list is
indistinguishable from "no data" and hides probing.

## Database Impact
None new; relies on existing composite foreign keys.

## API Impact
All member-data endpoints.

## UI/UX Impact
Unassigned members show an explicit "not assigned to you" state, not an empty page.

## Migration Impact
Depends on US-MIGRATE-OWNER having seeded assignments first.

## Test Plan
RBAC-03, RBAC-04, RBAC-12, SEC-03, SEC-04.

## Definition of Done
SEC-03 green. This is the epic's central case.

## Status
DRAFT

---

# US-ADMIN-LIFECYCLE

## User Story
As a Super Admin, I want to manage Admin accounts, so that organization administrators are
provisioned and removed at platform level.

## Context
ADR-013 Q1: admins are peers and cannot administer each other. Strict rank already denies;
this story builds the Super Admin path that fills the gap.

## Requirements
- Super Admin creates, suspends, deactivates `ADMIN` accounts in any organization.
- `ADMIN` attempting the same is denied `INSUFFICIENT_RANK`.
- Creating an admin issues an `INVITED` account activated through the existing flow.

## Acceptance Criteria
- **Given** admin A and admin B in one organization, **when** A suspends B, **then** 403.
- **Given** a Super Admin, **when** they suspend admin B, **then** it succeeds and is audited.

## Security Considerations
This is the only path by which a tenant-domain role is granted from the platform domain. It
must be individually audited and must not become a general bypass — `canActOn` still gives
platform principals no authority over tenant users; this is a separate, named capability.

## Database Impact
None new.

## API Impact
Super Admin endpoints for admin lifecycle.

## UI/UX Impact
Super Admin console gains admin management.

## Migration Impact
None.

## Test Plan
RBAC-07, RBAC-10, SEC-06, SEC-07.

## Definition of Done
Admin-to-admin denied; Super Admin path works and is audited.

## Status
DRAFT

---

# US-LAST-ADMIN

## User Story
As an organization, I want to never be left without an active Admin, so that the
organization cannot lock itself out.

## Context
ADR-013 Q3. Dropping `users_one_org_owner_idx` removes the database guarantee, so the rule
moves to the service layer — and must be transactional.

## Requirements
- Suspending or deactivating the **last** `ACTIVE` admin is refused, including self-action.
- The check and the write occur in **one transaction**, using `SELECT … FOR UPDATE` or a
  count re-asserted in the `UPDATE`'s `WHERE`.
- Super Admin may override.
- The refusal returns a reason, not a boolean.

## Acceptance Criteria
- **Given** two active admins, **when** one is suspended, **then** it succeeds.
- **Given** one active admin, **when** suspension is attempted, **then** refused with a reason.
- **Given** two admins suspending each other concurrently, **when** both commit,
  **then** at least one remains `ACTIVE`.

## Security Considerations
Availability, not confidentiality — but a locked-out organization is a real incident. A
disabled UI button is not the enforcement.

## Database Impact
None new. Requires row-level locking.

## API Impact
Status-change endpoints gain the guard.

## UI/UX Impact
The control explains why it is unavailable.

## Migration Impact
Must land with or after the index drop.

## Test Plan
ADMIN-01 … ADMIN-06. **ADMIN-04 is the case that matters.**

## Definition of Done
ADMIN-04 green under genuine concurrency, not sequential calls.

## Status
DRAFT

---

# US-JOINCODE-RESOLUTION

## User Story
As an applicant, I want to identify my organization by a code, so that I can request access
without the platform publishing its tenant list.

## Context
ADR-013 Q2, upholding the reasoning already written into `001_foundation.sql`.

## Requirements
- Resolve `join_code` → organization server-side; the client never supplies an organization id.
- Only `ACTIVE` organizations resolve.
- Unknown, inactive, and malformed codes produce an identical response.

## Acceptance Criteria
- **Given** a valid code, **when** submitted, **then** the request is attributed to that
  organization.
- **Given** an unknown code, **when** submitted, **then** the response is
  indistinguishable from a code belonging to a suspended organization.

## Security Considerations
No endpoint may return an organization list, count, or existence signal to an
unauthenticated caller. Timing must not distinguish the branches.

## Database Impact
None — `join_code` already exists and is unique.

## API Impact
Code-resolution used only by the access-request submission path.

## UI/UX Impact
Code field on the public form; invitation URLs may prefill it.

## Migration Impact
None.

## Test Plan
REQ-01, REQ-02, REQ-03, SEC-11, SEC-12.

## Definition of Done
SEC-11 and SEC-12 green.

## Status
DRAFT

---

# US-AUTH-ACCESS-REQUEST

## User Story
As someone without access, I want to request it, so that an admin can decide.

## Context
Replaces the never-built `account_status.PENDING` self-registration concept, which mixed
account status with request status — the mixing brief §8 forbids.

## Requirements
- `access_requests` table and `access_request_status` enum per ADR-013.
- Public form: join code, full name, email, phone, reason. **No role field.**
- Partial unique index — one `PENDING` per (organization, email).
- Rate limited per IP and per email; limiter fails closed.
- `account_status.PENDING` is retired.

## Acceptance Criteria
- **Given** a valid submission, **when** posted, **then** one `PENDING` row exists.
- **Given** a duplicate while one is `PENDING`, **when** posted, **then** refused by the index.
- **Given** a body containing `role: "ADMIN"`, **when** posted, **then** the field is ignored.

## Security Considerations
A new unauthenticated write endpoint — the largest new attack surface in this epic.
Rate limiting, no role acceptance, no enumeration, no credential storage.

## Database Impact
New table, new enum, partial unique index, composite FK on `reviewed_by`.

## API Impact
One public POST.

## UI/UX Impact
Responsive form with loading, success, and field-error states.

## Migration Impact
Ships in migration `006` — additive, independent of the role change.

## Test Plan
REQ-04 … REQ-07, REQ-13, SEC-13, UI-01, UI-02.

## Definition of Done
Form live, rate-limited, no role acceptance, no enumeration.

## Status
DRAFT

---

# US-ADMIN-REVIEW-REQUEST

## User Story
As an Admin, I want to review access requests, so that I control who joins my organization.

## Context
Administrative capability — org-wide, no assignment needed.

## Requirements
- Queue of `PENDING` requests for the admin's organization only.
- Detail view with applicant fields, date, status, and internal review notes.
- Approve and reject, each requiring confirmation.
- Approval and the resulting account creation are **one transaction**.

## Acceptance Criteria
- **Given** an admin of org 1, **when** they list requests, **then** only org 1's appear.
- **Given** an admin of org 2, **when** they approve org 1's request, **then** 403.
- **Given** an already-approved request, **when** approved again, **then** no second account.

## Security Considerations
`reviewed_by` carries a composite FK including `organization_id`, so a cross-tenant
reviewer is refused by PostgreSQL regardless of application logic.

## Database Impact
Writes `status`, `reviewed_by`, `reviewed_at`, `review_notes`.

## API Impact
List, detail, approve, reject.

## UI/UX Impact
Table on desktop, cards on mobile, status badges never colour-only, confirmation dialogs.

## Migration Impact
None beyond `006`.

## Test Plan
REQ-08 … REQ-11, UI-03, UI-04.

## Definition of Done
Approve creates exactly one `INVITED` user; reject creates none; both audited.

## Status
DRAFT

---

# US-ADMIN-CREATE-USER

## User Story
As an Admin, I want to create a member account directly, so that I can onboard someone who
did not use the request form.

## Requirements
- Creates `role = USER`, `status = INVITED`.
- Admin cannot set a password or any credential.
- Optionally creates an assignment to the creating admin at the same time.

## Acceptance Criteria
- **Given** an admin, **when** they create a member, **then** the account is `INVITED` with
  no credential.
- **Given** an admin, **when** they attempt to create an `ADMIN`, **then** denied.

## Security Considerations
`canAssignRole(ADMIN, 'ADMIN')` already denies; this story must not add a bypass.

## Database Impact
Insert into `users`, optionally `consultant_assignments`.

## API Impact
One admin endpoint.

## UI/UX Impact
Create-member dialog.

## Migration Impact
None.

## Test Plan
RBAC-10, SEC-13, REQ-12.

## Definition of Done
No credential ever created by an admin.

## Status
DRAFT

---

# US-ACCOUNT-ACTIVATION

## User Story
As an invited member, I want to activate my account, so that I can sign in.

## Context
Reuses the existing OTP + passkey flow. Brief §16 forbids a parallel authentication system.

## Requirements
- `INVITED` → `ACTIVE` on first successful code verification (already implemented).
- Passkey enrolment offered after activation.
- No new credential type, table, or endpoint.

## Acceptance Criteria
- **Given** an `INVITED` account, **when** it verifies a code, **then** it becomes `ACTIVE`
  and holds a session.
- **Given** a `REJECTED` request, **when** activation is attempted, **then** it fails —
  there is no account.

## Security Considerations
The existing bug class matters here: `TENANT_SESSION_SELECT` requires `ACTIVE`, so the
promotion must happen **before** the cookie is set or sign-in silently produces a dead session.

## Database Impact
Status transition only.

## API Impact
None new.

## UI/UX Impact
Activation lands on the member dashboard.

## Migration Impact
None.

## Test Plan
REQ-12, SEC-14, SEC-15, REG-01, REG-02.

## Definition of Done
Full path from request → approval → activation → session, proven end to end.

## Status
DRAFT

---

# US-USER-ISOLATION

## User Story
As a member, I want my data reachable only by me and my assigned admins, so that another
member can never read it.

## Requirements
- Every member-data read is scoped by session identity, never by a request parameter.
- Changing an id in a URL, body, or query yields 403.
- A user cannot modify their own `role` or `organization_id` through any write path.

## Acceptance Criteria
- **Given** user A, **when** requesting user B's resources, **then** 403.
- **Given** user A, **when** posting `role: "ADMIN"` to a profile update, **then** ignored.

## Security Considerations
IDOR, BOLA, privilege escalation. 403 must not leak existence through timing or status-code
differences.

## Database Impact
None.

## API Impact
Every member-facing endpoint.

## UI/UX Impact
None.

## Migration Impact
None.

## Test Plan
RBAC-05, SEC-09, SEC-10, SEC-18, SEC-19, SEC-20.

## Definition of Done
All IDOR/BOLA cases green.

## Status
DRAFT

---

# US-ORG-ISOLATION

## User Story
As an organization, I want my data unreachable by any other organization.

## Requirements
- Tenant scope comes from the session (ADR-004), never from input.
- Composite foreign keys keep cross-tenant rows unrepresentable.
- `CROSS_ORGANIZATION` denials are audited as `DENIED`.

## Acceptance Criteria
- **Given** an admin of org 1, **when** reaching any org 2 resource, **then** 403 and a
  `DENIED` audit row.

## Security Considerations
`audit_logs_denied_idx` exists so cross-tenant probing is watchable. Denials must reach it.

## Database Impact
None new.

## API Impact
All org-scoped endpoints.

## UI/UX Impact
None.

## Migration Impact
None.

## Test Plan
RBAC-09, SEC-05, SEC-19.

## Definition of Done
`tests/tenant-isolation.test.ts` rewritten for the merged model and green.

## Status
DRAFT

---

# US-SUPERADMIN-ISOLATION

## User Story
As a member, I want the platform operator to have no automatic access to my health data.

## Context
Brief §15 and ADR-001. `/owner` already honours this; the story proves and preserves it.

## Requirements
- Super Admin sees organizations, counts, and status — never individual member health data.
- No code path upgrades a platform session into tenant authority.
- `SUPER_ADMIN` is ungrantable through any tenant surface.

## Acceptance Criteria
- **Given** a Super Admin session, **when** member activities are requested, **then** denied.
- **Given** any tenant actor, **when** granting `SUPER_ADMIN`, **then** `UNGRANTABLE_ROLE`.

## Security Considerations
The "owner bypasses authorization" failure the brief warns about. Honoured by giving the
bypass no code path at all.

## Database Impact
None.

## API Impact
Super Admin endpoints only.

## UI/UX Impact
Console carries no member-level data.

## Migration Impact
None.

## Test Plan
RBAC-11, SEC-08, SEC-22.

## Definition of Done
SEC-08 green.

## Status
DRAFT

---

# US-AUDIT-LOGGING

## User Story
As an operator, I want every privileged action and denial recorded, so that misuse is
visible after the fact.

## Requirements
- Audit: role changes, status changes, assignment create/end, request approve/reject,
  admin lifecycle, and every authorization denial.
- Never audit: codes, tokens, credentials. `assertNoSecrets` stays enforced.
- Migration-created assignments recorded as `assignment.migrated`.

## Acceptance Criteria
- **Given** any privileged action, **when** performed, **then** an audit row exists naming
  actor, resource, and outcome.
- **Given** a denial, **when** it occurs, **then** outcome is `DENIED`.

## Security Considerations
An audit trail that can be edited is not one — append-only, no update path.

## Database Impact
Writes only.

## API Impact
None.

## UI/UX Impact
Admin activity view scoped to the organization.

## Migration Impact
Existing rows naming old roles are **not** rewritten.

## Test Plan
MIG-06, MIG-07, SEC-05, and the audit assertions inside RBAC/SEC cases.

## Definition of Done
Denials reach `audit_logs_denied_idx`; no secret ever written.

## Status
DRAFT

---

# US-MIGRATE-CUSTOMER

## User Story
As an engineer, I want `CUSTOMER` renamed to `USER` without downtime.

## Requirements
- Migration `006`: `ALTER TYPE tenant_role ADD VALUE 'USER'` — **added, not used**.
- Code in that deployment reads both values, writes `CUSTOMER`.
- Migration `007` backfills `CUSTOMER` → `USER`; the following deployment writes `USER`.

## Acceptance Criteria
- **Given** `006` applied and old code running, **when** the app serves traffic,
  **then** no error — the enum gained a value nothing uses.
- **Given** `007` applied, **when** users are queried, **then** no row holds `CUSTOMER`.

## Security Considerations
None directly; a failed migration is an availability incident.

## Database Impact
Enum value added, then a data backfill.

## API Impact
Role strings in responses change in the final deployment.

## UI/UX Impact
Role labels updated.

## Migration Impact
Governed by CLAUDE.md invariant 6 — a new enum label cannot be used in the transaction
that adds it.

## Test Plan
MIG-01, MIG-02, MIG-04, MIG-09.

## Definition of Done
Applied to `adira_test` first, then production, with no error in either container.

## Status
DRAFT

---

# US-MIGRATE-OWNER

## User Story
As the existing organization administrator, I want to keep seeing my members after the
merge, so that the migration does not lock me out of my own organization.

## Context
**The riskiest story in the epic.** Production's single `ORG_OWNER` has zero assignments.
A blind rename leaves it an `ADMIN` with no visible members.

## Requirements
- `007` seeds, for each migrating `ORG_OWNER`, an active assignment to every member of
  their organization they do not already have — **before** any role changes.
- Then backfill `ORG_OWNER` → `ADMIN`.
- Then drop `users_one_org_owner_idx`.
- Each seeded assignment audited as `assignment.migrated`.
- Idempotent: re-running produces no duplicates.
- **Access is not widened by making ADMIN org-wide.** The assignments record access the
  owner already held.

## Acceptance Criteria
- **Given** a pre-migration `ORG_OWNER` who could see N members, **when** `007` completes,
  **then** they are an `ADMIN` who can still see exactly those N members.
- **Given** `007` run twice, **when** assignments are counted, **then** no duplicates.
- **Given** `007` completes, **when** roles are queried, **then** no `ORG_OWNER` remains.

## Security Considerations
The tempting shortcut — grant `ADMIN` org-wide data reach to avoid seeding — is the exact
failure ADR-013 exists to prevent. Explicitly out of bounds.

## Database Impact
Inserts into `consultant_assignments`, updates `users.role`, drops one index.

## API Impact
None.

## UI/UX Impact
None.

## Migration Impact
Ordering is load-bearing: assignments **before** role change, index drop **after**.

## Test Plan
MIG-03, MIG-05, MIG-06, MIG-08, SEC-16, SEC-17.

## Definition of Done
SEC-16 and SEC-17 green against a seeded copy of production before production runs.

## Status
DRAFT

---

# US-ATTENTION-AUDIT

## User Story
As a member, I want "Needs Attention" to describe events, not judge my health.

## Context
ADR-013 Q6. `docs/METRICS.md` marks `assessAttention` `[proposed]`; this closes it.

## Requirements
- Signals limited to: missed activity, repeated incomplete activity, pending admin review,
  plan change awaiting acknowledgement, unresolved appointment, report awaiting review.
- No diagnosis, deterioration inference, clinical risk scoring, or treatment recommendation.
- Rendered strings state facts: "3 scheduled activities were missed".

## Acceptance Criteria
- **Given** `assessAttention`, **when** its signals are enumerated, **then** every one is
  on the permitted list.
- **Given** the UI, **when** a flagged member renders, **then** the text states an
  objective count and never a clinical claim.

## Security Considerations
Not a security control — a safety and liability one. This product is not qualified to make
clinical claims.

## Database Impact
None.

## API Impact
Possibly removes signals.

## UI/UX Impact
Wording review; status never colour-only.

## Migration Impact
None.

## Test Plan
ATT-01 … ATT-04.

## Definition of Done
`docs/METRICS.md` `[proposed]` marker replaced by `[fact]` with a citation.

## Status
DRAFT

---

## Documentation owed by this epic

`docs/RBAC.md`, `docs/SECURITY.md`, `docs/DATABASE.md`, `docs/ARCHITECTURE.md`,
`docs/ROADMAP.md`, `docs/KNOWLEDGE-MAP.md`, `docs/METRICS.md`, `docs/UX-SPECIFICATION.md`,
`BMAD/STATUS.md`, and `CLAUDE.md`'s invariant list — all describe the three-tier ladder and
must change in the same programme of work, not afterwards.

## Blockers

1. **P3/P4 of the test plan are unmet.** Migrations `006`/`007` do not exist, and no
   integration run has been observed leaving production untouched.
2. **Production contains test fixtures** (`demo.*@adira.test`) from an earlier
   misconfiguration. They should be removed before US-MIGRATE-OWNER, or they will receive
   migrated assignments.
3. **Resend sandbox** delivers only to the operator's own address, so activation cannot be
   tested with a second real person until a domain is verified.
