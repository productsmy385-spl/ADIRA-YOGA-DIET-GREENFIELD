# Source documents

Every document the user supplies — a brief, a plan, a spec, a poster, a revision — is
recorded here when it lands. This register is the answer to "where did this requirement
come from?", and it is the reason a later session can tell an instruction from an
inference.

## The intake rule

When the user supplies a new document, or a new version of one already listed:

1. **Store it verbatim** under `docs/` (product intent) or `/BMAD/` (process), with a
   provenance header. Never edit a source document to reflect what was built — its value
   is being the user's own words.
2. **Add a row below** — date, what it is, where it landed, what it supersedes.
3. **Reconcile it.** Read it against what already exists and state, in the Notes column
   or a linked document, every place it agrees, conflicts, or adds something new.
   A conflict that is noticed and recorded is cheap; one that is discovered during
   implementation is not.
4. **Raise an ADR** if it changes an architectural decision, and mark the superseded ADR
   rather than editing it.
5. **Update the Knowledge Base** at `~/.claude/KnowledgeBase/Projects/Adira/` so a future
   session inherits the change.

A superseded document is **kept**, not deleted. Mark its row `superseded by …`.

## Register

| Date | Document | Stored at | Status | Notes |
|---|---|---|---|---|
| 2026-08-22 | Master Knowledge Base v2.0 — 39 sections, product intent | `docs/KNOWLEDGE-BASE.md` | current | The authority on WHAT. Body byte-identical to the supplied file; only a provenance header was prepended. Also mirrored to the global Knowledge Base. |
| 2026-08-22 | BMAD Master Plan + 9-phase workspace | `/BMAD/` | current | The authority on HOW. Copied verbatim from `BMAD_Yoga_Therapy_Platform_Workspace`. See [../BMAD/STATUS.md](../BMAD/STATUS.md) for reconciliation against work already done. |
| 2026-08-22 | Two architecture posters (images) | not stored | referenced only | Supplied at project start. The placeholder logo was redrawn from their corner mark, and two open questions come from them — billing and consultant↔customer messaging. See `docs/BRANDING.md` and `docs/ROADMAP.md`. **The image files themselves are not in the repository.** |

## Not source documents

For the avoidance of doubt, these are **ours**, not the user's, and may be freely edited:

- everything else in `docs/`
- `decisions/ADR-*.md`
- `CLAUDE.md`
- the global Knowledge Base at `~/.claude/KnowledgeBase/Projects/Adira/`

## A caution about lookalikes

`Downloads/bmad-plan.md` is **TaskFlow EL20's** BMAD prompt — a different product of the
user's, and not applicable here. It was checked and rejected during intake on 2026-08-22.
Confirm which product a document belongs to before acting on it; several of the user's
projects use the same method and similar filenames.
