# Knowledge map

Which layer owns which knowledge. Read this when you are unsure where something belongs.

| Layer | Holds | Authority on |
|---|---|---|
| `docs/KNOWLEDGE-BASE.md` | the user's Master Knowledge Base v2.0, verbatim | **what the product must be** |
| `/BMAD/` | the user's BMAD method, verbatim, plus `STATUS.md` | **how work is planned and executed** |
| this repo — `docs/`, `decisions/`, `CLAUDE.md` | architecture, security, schema, deployment | how *this code* works and what must not break |
| `~/.claude/KnowledgeBase/Projects/Adira/` | product intent, decisions, lessons that outlive a task | cross-session memory |
| Linear | tasks, bugs, status | what needs doing |

New source documents are registered in [SOURCE-DOCUMENTS.md](SOURCE-DOCUMENTS.md), which
also carries the intake rule.

The repository is authoritative for anything verifiable from the code. The Knowledge Base
is authoritative for product intent, decisions, and lessons that outlive a task. Neither
should duplicate the other: the Knowledge Base links here rather than copying.

## The master brief

The user's own 39-section **Master Knowledge Base v2.0** lives in this repository at
[KNOWLEDGE-BASE.md](KNOWLEDGE-BASE.md), which is where both the brief's own §34 and the
BMAD workspace expect to find it. A copy is also kept at
`~/.claude/KnowledgeBase/Projects/Adira/MASTER-BRIEF-v2.0.md`, because it originally
existed only as a loose file in `Downloads/`.

It is the statement of *intent* — what the product must be. Where it and the code
disagree, the code wins for "what the system does" and the brief wins for "what it is
supposed to do"; resolve the conflict explicitly rather than letting it sit.

Known, deliberate divergences: this repository numbers the phases from 0 where the brief
numbers them from 1, and the ADRs are finer-grained than the four the brief names — both
recorded in [ROADMAP.md](ROADMAP.md). A third is recorded in
[../BMAD/STATUS.md](../BMAD/STATUS.md): BMAD's 19 epics and the roadmap's 19 phases are
the same programme described twice and do not align one-to-one.

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
