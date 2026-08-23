# ADR-014 — react-three-fiber for 3D, and what it costs the CSP

> Renumbered from ADR-013 on 2026-08-23. Two documents briefly shared that number:
> ADR-013 is the merged-ADMIN role model. Nothing in this decision changed.

**Decision:** 3D is built on `three` via `@react-three/fiber` and `@react-three/drei`,
loaded only through dynamic import, and never present in the `/today` bundle. Models are
glTF/GLB referenced by `model_reference` from the database. **Compressed model formats
(Draco/KTX2) are used on the landing route only, and require a documented CSP change.**

**Status:** Accepted — both open questions decided by the user on 2026-08-23.

**Date:** 2026-08-23

---

## Why

The brief requires a 3D yoga experience with scroll-driven storytelling and small
interactive dashboard modules. The choice is not really "which 3D library" — it is "how
does 3D coexist with a strict CSP and a mid-range Android phone", and those two
constraints decide almost everything.

## Alternatives considered

**Raw `three.js` with manual lifecycle management.** Fewer dependencies and full control.
Rejected: the scene graph would be imperatively managed alongside React's declarative
tree, and every mount/unmount becomes a manual disposal that leaks GPU memory when
forgotten. On a product where 3D appears inside a dashboard that mounts and unmounts
constantly, that leak is not hypothetical.

**`react-three-fiber` + `drei`.** Chosen. R3F reconciles the scene graph as React,
disposes on unmount, and `drei` supplies the pieces that would otherwise be hand-rolled —
`ScrollControls`, `useGLTF`, environment and lighting helpers. The scroll journey in
particular is a solved problem there.

**A pre-rendered video or image sequence instead of real 3D.** Genuinely worth
considering: a scrubbed video gives a cinematic scroll experience at a fraction of the
runtime cost, and degrades trivially. Rejected because §12's dashboard pose previews must
be *interactive* and driven by database-referenced models — a video cannot render a pose
that was added last week. Worth revisiting for the landing hero alone if the perf budget
proves unreachable.

**Spline / model-viewer.** Rejected: a third-party runtime with its own CDN and its own
CSP requirements, on a page holding health data.

## The CSP consequence — the part that needs a decision

`src/proxy.ts` currently enforces `script-src 'self' 'nonce-…' 'strict-dynamic'` and
`default-src 'self'`. A conventional R3F setup **is blocked by this**, in a way that
appears only in production:

| Needed | Blocked by |
|---|---|
| Draco / Meshopt decoders (WASM) | no `wasm-unsafe-eval` in `script-src` |
| KTX2 transcoder worker from a `blob:` URL | `worker-src` unset → falls back to `default-src 'self'` |

Two honest options:

1. **Self-host decoders and assets; add `wasm-unsafe-eval` and `worker-src 'self' blob:`.**
   `connect-src` stays closed, everything stays same-origin. `wasm-unsafe-eval` permits
   WebAssembly compilation — meaningfully narrower than `unsafe-eval`, which permits
   arbitrary JS.
2. **Uncompressed glTF only.** No CSP change whatsoever, at roughly 3–5× the model
   download.

**Recommended: (1) for the landing route, (2) for dashboard previews** — the dashboard
shows single static poses where a WASM decoder on the critical path costs more than the
compression saves.

What is **not** an option is quietly widening `script-src` when something fails to load.
Phase 16 was deferred for a whole project precisely so the policy could be strict; undoing
it in a hurry to make an animation work would be the worst trade in the codebase.

## Impact

- **Bundle:** `three` + R3F + drei is ~550–700 KB gzipped. Dynamic import only. A CI
  assertion should fail the build if the `/today` entry grows past its budget — otherwise
  this rule survives exactly until someone adds a convenient top-level import.
- **Memory:** every canvas pauses its render loop off-screen via `IntersectionObserver`.
- **Data:** none. `model_reference` already exists (migration 004). No migration, no API
  change.
- **Reversibility:** because scenes take a reference rather than a hardcoded model,
  swapping the placeholder for production art is a data change. That is what makes 15C
  safe to defer.
- **If the CSP change is refused:** option 2 still delivers the full experience, slower to
  load. Nothing in the architecture depends on compression.

## What this does not decide

- Which specific character model, or its licence — that is 15C, and blocked on art.
- Whether the landing hero eventually becomes a scrubbed video if the perf budget cannot
  be met on a mid-range device. 15D measures; this ADR does not pre-judge it.

---

## Decisions confirmed, 2026-08-23

### 3D asset target (15C)

A **professionally rigged, stylized-realistic human** — not photorealism, and not a
low-poly cartoon figure as the final production experience. Full body, humanoid skeleton
compatible with standard animation workflows, separate animation clips per pose, mobile-
conscious polygon and texture budget.

Stylized-realistic rather than photorealistic is the right target for this product: it
carries the premium identity without the download size and uncanny-valley risk of a
photoreal human, and it ages better than a stylisation tied to a trend.

`model_reference` stays mandatory and database-driven. No production model path is
hardcoded, and the development placeholder uses the same code path as the final asset —
which is what makes 15C safe to defer. **15C remains incomplete until production assets
are integrated.**

### CSP — scoped, not global

`wasm-unsafe-eval` and self-hosted decoders apply **only where the 3D experience
technically requires them**. The rest of the application keeps the strict policy shipped
in `2d7ac67`.

```
strict CSP  →  /today · /admin · /owner · /sign-in · /api/*
scoped CSP  →  the 3D experience route only
```

Unchanged everywhere, including on the 3D route:

- nonce-based `script-src` — the nonce is **not** removed
- `frame-ancestors 'none'`
- `object-src 'none'`
- no `unsafe-eval`, no `unsafe-inline` on scripts

`wasm-unsafe-eval` permits WebAssembly compilation only. It does not permit `eval` of
JavaScript, which is the distinction that makes this acceptable on one route rather than
a general weakening. `proxy.ts` will branch on pathname so the exception is visible in one
place and cannot spread by accident.

### Routing

```
/today            lightweight, NO 3D in the initial bundle
/experience/yoga  lazy-loads three → R3F → scene → model → animation
```

The heavy stack never reaches ordinary dashboard routes.

### 3D never controls business state

The user's rule, and it is the right one:

```
user completes activity → server validates → PostgreSQL records
                                              → UI updates → 3D responds
```

3D is a **presentation experience, never a business-logic dependency**. An animation
completing must not mark an activity complete; the animation reacts to state the database
already recorded. This keeps the activity engine, reporting and audit trail authoritative,
and it means a customer whose device cannot render 3D loses nothing but the animation.
