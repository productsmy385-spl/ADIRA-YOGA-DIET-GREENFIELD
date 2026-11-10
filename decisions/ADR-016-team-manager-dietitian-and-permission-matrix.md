# ADR-016 — TEAM_MANAGER and DIETITIAN, and one permission matrix

**Amends:** ADR-013 (role set). **Preserves:** ADR-001, ADR-004, ADR-013's rule that member
data is assignment-scoped, and the strict-rank rules of `canActOn` / `canAssignRole`.

## Context

The platform upgrade brief (`docs/PLATFORM-UPGRADE-BRIEF.md` §6, 2026-11-10) asks for
Team Manager and Dietitian roles and granular permissions. The user chose (2026-11-10)
to add both. Capabilities were previously answered by separate functions that each named
roles inline (`role !== "ADMIN" && role !== "TRAINER"`), which does not scale to six roles.

## Decision

1. **Role ladder** (`tenant_role`, migration `014`):
   `ADMIN 20 > TEAM_MANAGER 18 > TRAINER 15 = DIETITIAN 15 > STAFF 12 > USER 10`.
   Strict outranking is unchanged, so a Team Manager can grant TRAINER, DIETITIAN, STAFF
   and USER, and never ADMIN or another TEAM_MANAGER. TRAINER and DIETITIAN are peers and
   cannot act on each other.
2. **One matrix**, `src/server/authorization/permission-matrix.ts`: the brief's permission
   names (`members.create`, `diet.assign`, `website.publish`, …) mapped per role. The
   capability functions in `permissions.ts` read it; no function names a role inline any
   more. The matrix is the single source of truth (brief rule 14).
3. **Member data stays assignment-scoped for every role** (ADR-013 invariant 3). Holding
   `members.view` lets a Team Manager see the roster, never a member's practice.
4. **Data domains.** `canAccessMemberData` takes a domain — `profile`, `diet`, `all`. A
   DIETITIAN is allowed `profile` and `diet` only, so an assigned dietitian sees diet plans
   and diet activities and is refused yoga activity, check-ins and reports
   (`DOMAIN_RESTRICTED`). Every other role behaves exactly as before.
5. **Organisation settings and the website stay ADMIN-only**
   (`settings.update`, `website.*`).

| Permission group | ADMIN | TEAM_MANAGER | TRAINER | DIETITIAN | STAFF | USER |
|---|---|---|---|---|---|---|
| settings, tenant, website | all | view only | – | – | – | – |
| members (roster, create, update, assign, import/export) | all | all | – | – | – | – |
| team (view, invite, update, remove, assign roles ≤ rank) | all | all | – | – | – | – |
| yoga library/programmes/assign | all | view | all | – | – | – |
| diet library/programmes/assign | all | view | all | all | – | – |
| reports view / export | both | both | view | view | view | – |

## Consequences

- Pages guarded by `requireRole("ADMIN")` for member and team administration now admit
  TEAM_MANAGER, and each action re-checks the specific permission.
- `canManageProgrammes` and `canPrescribe` take a domain (`yoga` | `diet`) — a dietitian
  can author diet programmes and is refused yoga ones.
- Navigation and home pages exist for both roles: TEAM_MANAGER → `/admin/team`,
  DIETITIAN → `/trainer` (the assignment-scoped caseload view).
- Two new enum labels; additive. No existing user changes role.

**Status:** Accepted

**Date:** 2026-11-10
