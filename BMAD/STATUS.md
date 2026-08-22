# BMAD status and reconciliation

`BMAD-PLAN.md` and the `01-`…`09-` folders are the user's supplied method, stored
verbatim. **This file is ours** — it records where the project actually stands against
that method, and it exists because BMAD was adopted *after* Phase 0 had already been
built.

Last reconciled: 2026-08-22.

## The honest position

Implementation ran ahead of the method. Phase 0 — foundation, schema, security model,
migration and test infrastructure — was designed and built before BMAD was adopted, so
BMAD's Analysis, Product, and UX phases were never performed for it.

That is not a crisis: the work is documented, reasoned, and covered by ADRs. But it does
mean **there is no PRD and no approved user story behind any of the existing code**, and
the acceptance criteria BMAD requires were never written down. Do not read the green
checks below as "BMAD was followed from the start".

## Phase status

| # | BMAD phase | Status | Where the artefacts are |
|---|---|---|---|
| 1 | Analysis | **not started** | would produce `01-analysis/PRODUCT-CONTEXT.md`, `USER-JOURNEYS.md`, `PRODUCT-SCOPE.md`, `RISKS-AND-ASSUMPTIONS.md` |
| 2 | Product | **not started** | would produce `02-product/PRD.md` |
| 3 | UX | **not started** | `docs/BRANDING.md` covers the design system and tokens only — not the customer, admin, or owner experience |
| 4 | Architecture | **largely satisfied** | see mapping below |
| 5 | Epics & stories | **partially satisfied** | `docs/ROADMAP.md` holds the phase breakdown; no stories exist |
| 6 | Implementation | in progress | Phase 0 delivered; Phase 1 (provision PostgreSQL) is next |
| 7 | Testing & review | partially satisfied | `docs/TESTING.md`; 49 unit tests passing. No E2E, no isolation suites yet — those are repo Phase 3 |
| 8 | Deployment | **not started** | `railway.json` committed and CI green, but no Railway project exists |
| 9 | Retrospective | not started | first one is due at the end of the current epic |

## Phase 4 — do not duplicate what exists

`BMAD-PLAN.md` Phase 4 asks for seven documents. Six already exist in `docs/` and are
authoritative. **Write new architecture knowledge into those files, not into
`04-architecture/`.** Two copies of an architecture description diverge, and the
divergence is invisible until someone acts on the stale one.

| BMAD asks for | Already exists as | State |
|---|---|---|
| `ARCHITECTURE.md` | `docs/ARCHITECTURE.md` | complete for Phase 0 |
| `DATABASE.md` | `docs/DATABASE.md` | complete for Phase 0 |
| `SECURITY.md` | `docs/SECURITY.md` | complete, with gaps explicitly listed |
| `AUTHENTICATION.md` | `docs/AUTHENTICATION.md` | designed, **not implemented** |
| `RBAC.md` | `docs/RBAC.md` | rules built and tested; enforcement layer not built |
| `RAILWAY.md` | `docs/RAILWAY.md` | configured, not provisioned |
| `API.md` | **missing** | the one genuine gap. There are no API contracts yet because there is one route (`/api/health`). Write it when Phase 4 of the roadmap builds the service layer. |

## Phase 5 — epics map onto the existing roadmap

`BMAD-PLAN.md` lists 19 epics; `docs/ROADMAP.md` lists 19 phases (numbered 0–18). They
are the same programme of work described twice, and they do **not** align one-to-one.
`docs/ROADMAP.md` is authoritative for order and status.

| BMAD epic | Roadmap phase |
|---|---|
| 1 Foundation | 0 |
| 2 Authentication | 2 |
| 3 Authorization + 4 Multi-tenancy | 3 (the roadmap folds these together, with the isolation suites) |
| 5 Customer + 8 Activities | 5 (the roadmap does not give activities a separate phase) |
| 6 Yoga | 6 |
| 7 Diet | 7 |
| 9 Admin | 8 |
| 10 Owner | 9 |
| 11 Notifications | 10 |
| 12 Reporting | 11 |
| 13 ImageKit | 12 |
| 14 Import/Export | 13 |
| 15 PWA | 14 |
| 16 3D | 15 |
| 17 Security | 16 |
| 18 Testing | threaded through every phase; `docs/TESTING.md` names the Phase 3 gate |
| 19 Deployment | 18 |
| *no BMAD epic* | 1 — provision Railway PostgreSQL, apply migrations |
| *no BMAD epic* | 4 — service and repository layers |
| *no BMAD epic* | 17 — performance and accessibility |

Three roadmap phases have no BMAD epic. They are real work and must not be dropped
because the epic list omits them.

## What to do next

BMAD says do not skip planning for major features, and repo Phase 1 (provision the
database, apply the schema) is infrastructure rather than a feature — it can proceed
under the existing ADRs.

The first work that genuinely needs BMAD Phases 1–3 first is **repo Phase 5, the customer
dashboard**: it is the first user-facing surface, and there is currently no PRD, no user
journey, and no acceptance criteria for it. Doing Analysis → Product → UX before then is
what stops the dashboard being designed in the act of building it.

Four open product questions block a complete PRD. They are listed in `docs/ROADMAP.md`
and need the user: the official logo, whether billing is in scope, whether
consultant↔customer messaging is real, and which Linear team owns this work.
