# Platform upgrade brief — reconciliation and plan

Reconciles [PLATFORM-UPGRADE-BRIEF.md](PLATFORM-UPGRADE-BRIEF.md) (supplied 2026-11-10)
against the Master Knowledge Base, the ADRs and the code as of commit `1e523db`. This file
is ours and may be edited; the brief itself may not.

Tags: [fact] verified in code or docs, [proposed] a recommendation awaiting decision.

## 1. What already exists (preserve, extend — do not rebuild)

| Brief area | Existing implementation |
|---|---|
| Multi-tenancy, scope from session | `organizations`, `organization_id` everywhere, composite FKs; ADR-004 [fact] |
| Authentication | Clerk proves identity, Adira sessions (ADR-015); invite-only [fact] |
| Roles | `SUPER_ADMIN` (`owner_accounts`), tenant `ADMIN`/`TRAINER`/`STAFF`/`USER` (ADR-013, migration `011`) [fact] |
| Authorization | Central capability functions in `src/server/authorization/permissions.ts`: `canManageOrganization`, `canManageProgrammes`, `canPrescribe`, `canAssignRole`, `canActOn`, `canAccessMemberData` (assignment-scoped) [fact] |
| Yoga | `yoga_exercises` library, `programmes`/`programme_items`, `assignments`, `daily_activities`, `daily_checkins`; `/admin/yoga`, `/admin/programmes`, `/trainer`, `/today` [fact] |
| Diet | `meals`; `/admin/diet` [fact] |
| Team | `/admin/team`, `consultant_assignments`, caseload [fact] |
| Navigation | `AppNav` (desktop) + role-aware `MobileTabBar` (fixed bottom, safe-area) in `src/components/nav/` driven by `nav-items.ts` [fact] |
| Layout / metrics | `PageShell`, `StatTile`, `StatRow` in `components/ui/page-shell.tsx`, `GlassPanel` [fact] |
| Audit | `audit_logs` via `recordAudit` on sensitive actions [fact] |

## 2. Gaps (genuinely missing)

- **Metric consistency** — `admin/page.tsx`, `admin/analytics`, `dashboard`, `super-admin` each define their own local metric component instead of `StatTile` [fact]. Fixable without schema change.
- **Collapsible desktop sidebar** — none; `AppNav` has no collapse state [fact].
- **Tenant public website builder** — nothing exists: no tables, routes, templates or public tenant pages [fact]. The Master KB mentions only "Website header" under Branding.
- **Yoga sessions / attendance / scheduling** — no tables [fact]. The KB lists "Appointments" under roles, so this is in scope but unbuilt.
- **Team profiles** (photo, specialization, qualifications) — no columns [fact].
- **Granular permission names** — capabilities exist as functions, not as a named permission matrix [fact].
- **Media uploads** — ImageKit integration exists but its keys are **not set** in the new production environment [fact], so logo/hero/team photo upload would fail there today.

## 3. Conflicts with recorded decisions — need the user's call

| # | Brief says | Recorded position | Proposed |
|---|---|---|---|
| C1 | Colourful Neo-Brutalist, glassmorphism, palette `#2AA704 #15A8EB #EF0E23 #0CBDC8` | Master KB §24: deep botanical green, sage, ivory, terracotta, saffron; "Avoid excessive glassmorphism" | User decides. If adopted: tokens defined once in `globals.css` (invariant 7) and KB §24 recorded as superseded in the register. |
| C2 | Seven roles incl. Organization Admin, Tenant Admin, Team Manager, Dietitian | ADR-013 + `011`: ADMIN / TRAINER / STAFF / USER. In Adira the organization **is** the tenant, so "Organization Admin" and "Tenant Admin" are the same role | [proposed] Map: Tenant/Org Admin → `ADMIN`; Yoga Instructor → `TRAINER`; add `DIETITIAN` (diet-only data reach via assignment). Team Manager only if the user needs it. New ADR either way. |
| C3 | Named permission strings (`website.publish`, …) | Capability functions are the single source of truth (brief rule 14 also forbids a second one) | [proposed] One role→permission matrix module; existing `can*` functions read from it. `canAccessMemberData` stays assignment-scoped (invariant 3). |
| C4 | Implement the website builder now | CLAUDE.md / BMAD: a major feature needs Phases 1–3 (PRD, UX) first; none exist for it | [proposed] Short PRD + UX spec for the builder before code (Stage 3), while Stages 1–2 proceed. |
| C5 | "Do not commit or deploy until reviewed" | A push to `main` deploys to production | Work on a branch; nothing merges to `main` without approval. |

### Decisions taken by the user, 2026-11-10

| # | Decision |
|---|---|
| C1 | **Adopt the brief's colourful palette and style.** Master KB §24's colour direction is superseded for the visual layer (recorded in `SOURCE-DOCUMENTS.md`). Colours still defined once, as tokens in `globals.css`. |
| C2 | **Add `DIETITIAN` and `TEAM_MANAGER`.** `ADMIN` = Tenant/Organization Admin, `TRAINER` = Yoga Instructor, `STAFF` stays. Needs an ADR amending ADR-013 at Stage 4. |
| URL | **Tenant public sites at a path:** `/s/<organization-slug>`. |
| C4/C5 | **Branch, stage by stage**, review stop after each stage; website-builder spec approved before Stage 3 code. |

Compatible, no conflict: tenant-site Sign In can pass the organization **slug as a hint** to
`/sign-in`; the server still validates membership after Clerk verifies identity (ADR-012,
ADR-015). It does not create a second auth system.

## 4. Progress (branch `feature/platform-upgrade`, uncommitted pending review)

| Stage | State | Notes |
|---|---|---|
| 1 | built, awaiting review | Palette tokens re-pointed; `MetricCard`/`MetricGrid` replaced five metric components; spacing tokens in `PageShell` |
| 2 | built, awaiting review | `ConsoleShell` shared by tenant and platform consoles: collapsible sidebar (pre-paint state, persisted), modal drawer, role-aware bottom bar. Fixed: duplicate bottom bars on 16 pages; admin tabs shown to TRAINER/STAFF; logo home for TRAINER/STAFF; platform sidebar covering content; platform console had no sign-out |

| 3a–3c | built, awaiting review | Spec approved (`BMAD/02-product/WEBSITE-BUILDER-PRD.md`). Migration `013`; content model + publish rules; repository; `canManageWebsite`; audited service; 8 templates; public `/s/<slug>`; tenant-aware sign-in (`?org=` hint); editor with autosave, gallery, preview frames, publish/unpublish/restore. Framing allowed same-origin for `/admin/website/preview` only. |
| 3d | built | Website image uploads via the existing ImageKit pipeline (`website` purpose, public, server-resolved URLs). **Live only once ImageKit keys are set.** |
| 4 | built, awaiting review | ADR-016: TEAM_MANAGER (18) and DIETITIAN (15), `permission-matrix.ts` as the single source; capability functions read it; dietitian member data restricted to profile + diet; migration `014`; guards across members/team/programmes/diet pages |
| 5 | built, awaiting review | Migration `015`: team profiles; `yoga_sessions` + participants with attendance. `/admin/sessions` (schedule, participants from own caseload, attendance, notes); instructor "today's sessions"; member "upcoming classes"; session analytics; team directory with workload, role/status/profile edits and member assignment, all rank-checked and audited |

A new isolated test database `adira_test` was created on the current Railway server
(2026-11-10, user-approved) and `.env.local` points at it; migrations `001`–`015` applied.

## 5. Staged plan

Each stage ends with typecheck, lint, targeted tests, build, a browser check, and a review
stop. Sizes are honest: the whole brief is several weeks of work.

| Stage | Scope | Schema change | Blocked on |
|---|---|---|---|
| 1 | Shared `MetricCard`/`MetricGrid` (from `StatTile`), page spacing tokens, apply to every dashboard | none | C1 (colour only) |
| 2 | Collapsible desktop sidebar (persisted), mobile drawer, refine `MobileTabBar` per role | none | C1 |
| 3 | Website builder: content model, 8 templates, editor, preview, draft/publish/unpublish, public `/s/[slug]` pages, Sign In | new `organization_websites` (+ versions) | C4 PRD, URL scheme, ImageKit keys |
| 4 | Permission matrix + new role(s), role assignment UI, isolation and escalation tests | enum label(s) | C2, C3 |
| 5 | Yoga sessions, attendance, instructor tools, analytics; team profiles and workload | new tables / columns | Stage 4 roles |
| 6 | Responsive QA at all listed widths, regression and security tests, release | — | — |
