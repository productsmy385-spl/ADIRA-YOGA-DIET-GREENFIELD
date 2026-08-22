# Knowledge Base

Adira's durable, cross-session knowledge lives **outside this repository**, in the global
Knowledge Base at `~/.claude/KnowledgeBase/Projects/Adira/`.

This file exists so that someone reading `docs/` knows that, and knows which layer owns
what.

## Division of responsibility

| Question | Lives in |
|---|---|
| What is the product? Why was it decided this way? How does the system work? | Knowledge Base |
| What needs doing? Who owns it? What is the status? | Linear |
| How does *this code* work, and what must not be broken? | this repo — `docs/`, `decisions/`, `CLAUDE.md` |

The repository is authoritative for anything verifiable from the code. The Knowledge Base
is authoritative for product intent, decisions, and lessons that outlive a task. Neither
should duplicate the other: the Knowledge Base links here rather than copying.

## The master brief

The user's own 39-section **Master Knowledge Base v2.0** is preserved at
`~/.claude/KnowledgeBase/Projects/Adira/MASTER-BRIEF-v2.0.md`. It originally existed only
as a loose file in `Downloads/`, which is the least durable place on the machine.

It is the statement of *intent* — what the product must be. Where it and the code
disagree, the code wins for "what the system does" and the brief wins for "what it is
supposed to do"; resolve the conflict explicitly rather than letting it sit.

Two known, deliberate divergences are recorded in [ROADMAP.md](ROADMAP.md): this
repository numbers the phases from 0 where the brief numbers them from 1, and the ADRs
are finer-grained than the four the brief names.

Do not edit that copy to reflect implementation. Its value is being the user's own words.

## Accuracy convention

Claims in the Knowledge Base are tagged by how they are known — `[fact]` (verified, with
a `path/file.ts:42` citation), `[observed]`, `[assumption]`, `[proposed]`. An assumption
is never promoted to documentation without being verified.

Where something is unknown, it is written as "Not yet documented — <what to check or
ask>" rather than filled with a plausible guess.

## Linear

Tasks, bugs, and status belong in Linear, not in markdown checklists here.

**Adira's Linear team is not yet recorded.** The workspace has TempleOS (`TEM`) and
Marketives (`MAR`); neither obviously owns a new wellness product. Ask before filing
issues, and record the answer in the Knowledge Base's `PRODUCT.md` once decided.
