# ADR-008 — BMAD is the planning and execution method

**Date:** 2026-08-22

**Status:** Accepted

**Decision:** Work on Adira is planned and executed through the user's BMAD method,
stored verbatim at `/BMAD/`. The Knowledge Base at `docs/KNOWLEDGE-BASE.md` defines
*what* to build; BMAD defines *how* to plan and execute it. Neither is edited to reflect
implementation.

**Why:** Both documents were supplied by the user on 2026-08-22 with the instruction to
follow them. Recording this as a decision rather than a convention matters because BMAD
constrains the *order* of work — analysis before product, product before UX, UX before
architecture, and no implementation of a story whose acceptance criteria are unclear.
That is a real constraint on how features get built, and a future session that does not
know it will simply build.

## Context

BMAD was adopted **after** Phase 0 was already designed and built. The foundation,
schema, security model, migration and test infrastructure therefore exist without a PRD,
without user journeys, and without a single approved user story behind them.

This is recorded plainly in `BMAD/STATUS.md`, because the alternative — quietly marking
Phase 4 "done" because `docs/ARCHITECTURE.md` happens to exist — would misrepresent how
the work was actually produced.

## Alternatives considered

- *Adopt BMAD and retro-fit Phases 1–3 to cover Phase 0.* Rejected. Writing a PRD after
  the fact, to describe code that already exists, produces a document that justifies
  rather than directs. It would also be largely invented: the brief does not contain the
  user journeys or business goals that Analysis requires.

- *Treat BMAD as advisory.* Rejected. The user asked for it to be followed, and a method
  that is followed only when convenient provides none of the protection it exists for.

- *Reorganise `docs/` into the BMAD folder structure.* Rejected. BMAD Phase 4 names six
  documents that already exist under `docs/` and are cited from source comments, lint
  rules, and migration headers. Moving them would break those citations; copying them
  would create two descriptions of one architecture that drift apart silently.

## Chosen approach

- `/BMAD/` holds the method verbatim, plus `STATUS.md` — ours — mapping the nine phases
  onto what actually exists.
- Architecture knowledge continues to live in `docs/`. `BMAD/04-architecture/` points
  there rather than duplicating it. The one genuine gap is `API.md`, which is deferred
  until there is more than one route to describe.
- BMAD's 19 epics and `docs/ROADMAP.md`'s 19 phases are the same programme described
  twice. **`docs/ROADMAP.md` is authoritative for order and status**; the mapping is in
  `BMAD/STATUS.md`. Three roadmap phases have no BMAD epic and must not be dropped.
- Infrastructure already covered by an ADR may proceed without Phases 1–3. The first work
  that genuinely requires them is the customer dashboard.

## Consequences

Feature work now costs more up front: a major feature needs analysis, requirements, and a
UX specification before implementation, and a story needs acceptance criteria before it
can be started. That is the intended trade.

Four open product questions — the official logo, whether billing is in scope, whether
consultant↔customer messaging is real, and the Linear team — now block a *complete* PRD
rather than merely being noted. They need the user.

## Security impact

None directly. Indirectly positive: BMAD requires security considerations and a test plan
on every story, which is where the brief's seven critical isolation tests get attached to
concrete work rather than remaining a list in a document.

## Operational impact

New source documents follow the intake rule in `docs/SOURCE-DOCUMENTS.md`: store
verbatim, register, reconcile, raise an ADR if a decision changes, update the Knowledge
Base. Superseded documents are kept and marked, never deleted.
