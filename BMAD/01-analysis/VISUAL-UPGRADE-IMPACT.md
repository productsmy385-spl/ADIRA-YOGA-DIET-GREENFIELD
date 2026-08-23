# Impact Analysis — Botanical Wellness Glass + 3D

**BMAD Phase 1 (Analysis), for the visual upgrade.** Written before any implementation,
per the brief's own instruction. It answers one question: what does this change, and what
must it not touch?

Nothing here is a design document — that is `docs/UX-SPECIFICATION.md`. This is the list
of collisions, costs, and dependencies that decide whether the design is buildable as
specified.

---

## 1. What this does NOT change

Confirmed by inspection, not assumption. The visual layer sits entirely above these:

| Preserved | Why it is unaffected |
|---|---|
| PostgreSQL schema, 5 migrations | No visual requirement adds a column. Pose data uses `yoga_exercises.model_reference`, which already exists (migration 004). |
| Authentication, sessions, passkeys | No UI change touches `src/server/auth/`. |
| RBAC, ADR-002 assignment scoping | Reach is decided in SQL (`listCaseload`, `canViewCustomer`). **Role-aware navigation hides links; it does not grant anything** — §25's rule is already how the system works. |
| Organisation isolation (ADR-004) | Composite foreign keys are untouched by CSS. |
| API contracts | No route signature changes. New 3D data is read through existing repositories. |
| Audit logging, rate limits | Untouched. |
| BMAD, Knowledge Map, 19-phase roadmap | Extended, not replaced — Phase 15 splits into 15A–15D. |

**One real risk to that list:** a redesign that moves data-fetching into client components
to make animation easier would move authorization decisions client-side. The rule for
this work is that **every page keeps fetching on the server**; 3D and motion are
presentation over already-authorised data.

---

## 2. The sharpest collision: 3D versus the CSP we just shipped

`src/proxy.ts` (Phase 16, committed `2d7ac67`) enforces:

```
script-src 'self' 'nonce-…' 'strict-dynamic';
default-src 'self';
```

**This will block a standard react-three-fiber setup**, and it will do so in a way that
looks like "3D is broken on production but fine locally":

| What 3D needs | Why the current CSP blocks it |
|---|---|
| Draco / Meshopt geometry decoders | Loaded as **WASM**, requiring `wasm-unsafe-eval` in `script-src`. Not present. |
| KTX2 texture transcoder | Same, plus a **web worker created from a `blob:`** URL. `worker-src` is unset, so it falls back to `default-src 'self'` and blob workers are refused. |
| Model/texture files from a CDN | `connect-src` currently allows only `'self'` and ImageKit. |

**This is a decision, not a config tweak.** Options, with the trade-off stated:

1. **Self-host decoders and assets, add `wasm-unsafe-eval` + `worker-src 'self' blob:`.**
   Keeps `connect-src` closed and everything same-origin. `wasm-unsafe-eval` is
   meaningfully weaker than nothing, but far narrower than `unsafe-eval` — it permits
   WebAssembly compilation, not arbitrary JS `eval`.
2. **Avoid compressed formats entirely** — plain glTF, no Draco/KTX2. No CSP change at
   all, at the cost of roughly 3–5× the model download.
3. Loosen `script-src` broadly. **Rejected outright** — it would undo Phase 16.

Recommendation: **(1) for the landing experience, (2) for the small dashboard previews**,
because the dashboard modules are single static poses where the compression saving does
not justify a WASM decoder on the critical path.

Either way, `docs/SECURITY.md` gains an entry, and the change must be a deliberate ADR —
not a line quietly appended to the CSP when something 404s.

---

## 3. Performance — the honest arithmetic

The customer we designed for (`PRODUCT-CONTEXT.md`) is *"frequently older, frequently on
a mid-range Android phone"*, opening the app *"early in the morning before practice"*.
That person is the constraint on every decision below.

| Cost | Measured expectation | Consequence |
|---|---|---|
| `three` + `@react-three/fiber` + `drei` | ~550–700 KB gzipped | **Must never be in the `/today` bundle.** Dynamic import only, and only for routes that show 3D. |
| A rigged character + animations | 2–8 MB depending on compression | Landing page only, lazy, behind an explicit "view" interaction on mobile. |
| `backdrop-filter` | GPU compositing per blurred layer | The subtler risk. Many stacked blurred surfaces drop mid-range Android to visibly poor scrolling. **Cap the number of simultaneously blurred layers** — see the UX spec's level system. |

**J1 is the line that must not move.** The daily loop — open, see today, mark done — is
the journey the product lives or dies by, ~365 times a year per customer. If the visual
upgrade adds a second to that, the upgrade is a net loss no matter how it looks.

Proposed budget, to be verified in Phase 15D rather than asserted now:

- `/today`: **no 3D at all in the initial render**; pose preview lazy-loads below the fold
- Landing: interactive by ~2.5 s on a mid-range device, or the static fallback shows
- Any 3D canvas pauses its render loop when off-screen (`IntersectionObserver`)

---

## 4. Glass versus WCAG — the hardest constraint

Transparency reduces contrast. That is not a styling detail; it is the single most likely
way this redesign fails accessibility.

A glass surface's effective contrast depends on **what happens to be behind it**, which
changes as the page scrolls. A card that passes 4.5:1 over the hero gradient can fail over
a bright botanical shape 200 px later.

The rule this project will adopt: **text never sits on unbounded glass.** Every glass
surface carries a solid or near-solid token layer behind its text content, so contrast is
computed against a known colour rather than against whatever is behind the blur. Glass
provides the *edge and depth*; the text sits on a defined surface.

This is testable, and Phase 15D owes an automated contrast check over the token pairs in
both themes.

---

## 5. Asset dependency — the part code cannot finish

§8 requires a *"realistic/high-quality human yoga character… rigged… professional yoga
posture"*. That is art production, not engineering.

**Splitting Phase 15 into 15A–15D is the right call and resolves my earlier "blocked".**
15A, 15B and 15D are fully completable now against a development placeholder. 15C cannot
be completed by writing code.

Tracked explicitly:

| Dependency | Needed for | Status |
|---|---|---|
| Rigged humanoid glTF/GLB with yoga animation clips | 15C | **Not available.** Not sourced, not commissioned. |
| Per-pose animation clips (Tadasana, Vrikshasana, …) | 15C | Not available |
| Licence terms for any purchased model | 15C, and legal review | Unknown |

The architecture requirement in §7 — load `model_reference` from the database, never
hardcode a model — is what makes this safe: the placeholder and the final asset are the
same code path, and swapping them is a data change.

**Phase 15 must not be reported complete until 15C is.** That is the brief's own rule
(§26) and it is recorded in `docs/ROADMAP.md`.

---

## 6. Token system — additive, not a rewrite

`src/app/globals.css` already declares 146 custom properties, including the full semantic
set (`--background`, `--primary`, `--muted`, chart and sidebar ramps) and status tokens
named for meaning (`--status-complete`, `--status-missed`).

The brief's list is **mostly a superset**, not a replacement. What is genuinely new:

- `--surface`, `--surface-glass`, `--surface-glass-strong`, `--border-glass`
- `--success`, `--warning`, `--danger`, `--info` (today only `--destructive` exists)
- the elevation levels from §22

**Renaming existing tokens would touch every component for no user-visible gain**, so the
existing names stay and the new ones are added alongside. `--destructive` and `--danger`
will co-exist, with `--danger` defined in terms of `--destructive` rather than duplicating
a value — one source, two names, no drift.

---

## 7. Scope reality check

The brief lists 30 sections. Delivered honestly, this is **several phases of work**, not
one. What follows is the order the brief itself gives (§28), grouped by what can be
verified independently:

| Group | Contents | Verifiable by |
|---|---|---|
| **A. Foundation** | tokens, glass primitives, backgrounds, typography | Visual review + contrast test; no behaviour change |
| **B. Application surfaces** | navigation, dialogs, dashboard components | Existing suites still green; role-aware nav proven not to grant access |
| **C. Landing + motion** | landing redesign, scroll storytelling (2D first) | Reduced-motion honoured; no CLS regression |
| **D. 3D (15A/15B/15D)** | engine, viewer, scroll scene, fallbacks | WebGL-unavailable path, mobile fallback, perf budget |
| **E. 15C** | production assets | **Blocked on art** |

Attempting all five in one pass would produce a large unreviewable diff over a codebase
whose security properties are its main asset. Group A lands first and independently.

---

## 8. Risks this introduces

| # | Risk | Mitigation |
|---|---|---|
| V1 | CSP loosened casually to make 3D work, undoing Phase 16 | Any CSP change requires an ADR naming the exact directive and why |
| V2 | Glass fails WCAG over variable backgrounds | Text never on unbounded glass (§4 above); automated contrast check in 15D |
| V3 | 3D bundle reaches `/today` and slows the daily loop | Dynamic import only; bundle-size assertion in CI |
| V4 | Motion causes nausea | `prefers-reduced-motion` honoured globally — already in `globals.css`; scroll-driven camera disabled entirely under it |
| V5 | Redesign moves fetching client-side and weakens authorization | Server components keep fetching; no repository call from a client component |
| V6 | Placeholder art ships and is mistaken for finished | 15C tracked as an explicit dependency; landing states plainly that the character is a development placeholder |
| V7 | Mid-range Android scroll jank from stacked blur | Blur-layer cap in the level system; measured on a real device before 15D closes |

---

## 9. Open questions for the user

1. **3D assets** — are you sourcing/commissioning a rigged character, or should 15C be
   planned around a stylised low-poly figure that can be produced without a modeller?
2. **CSP trade-off** — is `wasm-unsafe-eval` + self-hosted decoders acceptable for the
   landing route (option 1 above), or should we stay uncompressed and pay the download?
3. **Scope order** — confirm Group A (tokens, glass, backgrounds, typography) lands and is
   reviewed before Group B begins, rather than one large redesign.
