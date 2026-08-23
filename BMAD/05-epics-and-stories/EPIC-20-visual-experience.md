# Epic 20 — Botanical Wellness Glass + 3D

**Source:** visual brief, 2026-08-23 (30 sections).
**Design:** `docs/UX-SPECIFICATION.md` · **Impact:** `BMAD/01-analysis/VISUAL-UPGRADE-IMPACT.md` · **Stack:** ADR-014.

Presentation only. Authentication, RBAC, organisation isolation, API contracts and the
database are unchanged — see the impact analysis §1 for the verification.

Status vocabulary: `DRAFT` · `READY` · `IN_PROGRESS` · `BLOCKED` · `IN_REVIEW` · `DONE`.

---

## Group A — Foundation

### A1 · Design tokens · READY
**As** a developer **I want** one token set **so that** a colour is defined once.

- Adds `--surface`, `--surface-glass`, `--surface-glass-strong`, `--border-glass`,
  `--success`, `--warning`, `--danger`, `--info`
- Existing token names unchanged; `--danger` is defined **in terms of** `--destructive`
- Light and dark
- **AC:** no hex outside `globals.css` (lint enforces); every new token defined in both
  themes; no visual change to existing components beyond the palette shift

### A2 · Contrast verification · READY
**As** a customer with low vision **I want** readable text.

- Automated check over every foreground/background token pair, both themes
- 4.5:1 body, 3:1 large text and meaningful non-text
- **AC:** runs in CI; fails the build on a failing pair. Not an eyeball review

### A3 · Glass primitives · READY (depends A1)
- `src/components/glass/`: Card, Panel, Dialog, Sheet, Navbar, Sidebar, Metric, Button,
  Input, Select, Table, ChartContainer
- Each takes a `level` (0–4) and derives everything from tokens
- `GlassDialog` **wraps** the existing `FormDialog` — the §23 behaviour (validation,
  loading, error, focus, double-submit guard) is not re-implemented
- **AC:** no `backdrop-blur-[…]` or bespoke glass anywhere outside this directory;
  `form-dialog.test.tsx` still passes unchanged

### A4 · Layered background · READY (depends A1)
- Base gradient → botanical SVG shapes → noise (~3%) → ambient glow
- CSS/inline SVG only, no raster
- **AC:** does not animate on its own; at most two blurred layers overlap anywhere

### A5 · Typography scale · READY
- Display / Heading / Body / Metric / Meta
- Metric uses **tabular numerals** — without them a counting animation reflows the card
  every frame
- **AC:** existing Geist setup retained

---

## Group B — Application surfaces

### B1 · Role-aware navigation · DRAFT (depends A3)
- Customer, Admin, Org owner, Platform owner item sets per UX §8
- Bottom tab bar on mobile for customers
- **AC:** **hiding a link grants nothing** — a test asserts that a customer requesting an
  admin route still gets the existing redirect, and an ADMIN requesting an unassigned
  customer still gets 404

### B2 · Dialogs and sheets · DRAFT (depends A3)
- `GlassDialog` becomes `GlassSheet` below `sm`
- **AC:** all 13 existing `form-dialog` tests pass untouched

### B3 · Dashboard components · DRAFT (depends A3)
- `/today`, `/admin`, `/admin/analytics`, `/owner` reskinned
- Metric counting from **previous real value**; `null` renders `—`, never an animated `0%`
- **AC:** no repository call moves into a client component; every page still fetches
  server-side

---

## Group C — Landing and motion

### C1 · Landing redesign · DRAFT (depends A3, A4)
- Hero → Journey → Yoga → Diet → Activities → Progress → Consultant → Reports → Security
  → Install → CTA
- **AC:** every claim maps to something built; no advertised feature that does not exist

### C2 · Micro-interactions · DRAFT
- Hover lift, card stagger, dialog scale, progress sweep, page cross-fade
- **AC:** `prefers-reduced-motion` removes movement, never information

---

## Group D — 3D

### D1 (15A) · Engine and viewer · DRAFT
- `src/components/3d/`: YogaScene, YogaCharacter, YogaPose, YogaSequence, YogaCamera,
  YogaLighting, YogaEnvironment, YogaFallback
- Loads `model_reference` from the database — **no model hardcoded**
- Dynamic import only
- **AC:** `/today` initial bundle contains no 3D, asserted in CI; scene disposes on
  unmount; render loop pauses off-screen

### D2 (15A) · Pose system · DRAFT
- Pose = id, name, description, duration, difficulty, animationReference,
  modelReference, instructions
- Read from `yoga_exercises`; the seven named poses are **seed data, not the schema**
- **AC:** a pose added to the database appears with no code change

### D3 (15B) · Scroll journey · DRAFT (depends D1)
- Hero → Breathing → Movement → Strength → Balance → Meditation → Wellness
- One continuous camera path driving position, pose timeline, lighting, environment
- **AC:** under reduced motion the scene is a static representative pose with no camera
  movement, and all seven sections remain readable

### D4 (15D) · Fallbacks and performance · DRAFT (depends D1)
- WebGL unavailable → static pose + full text
- Slow device → reduced pose set, no environment
- Asset failure → `YogaFallback`, page still functional
- **AC:** every 3D element has a text equivalent carrying name, duration and instructions;
  measured on a real mid-range Android before this closes

### D5 (15C) · Production assets · **BLOCKED**
- Rigged humanoid glTF/GLB + per-pose animation clips
- **Blocked on art production.** Not sourced, not commissioned, licence unknown
- **AC:** Phase 15 may not be reported complete until this is done; while a placeholder is
  on screen the landing states so plainly

### D6 · CSP change for compressed models · **BLOCKED on user decision**
- Option 1: self-host decoders, add `wasm-unsafe-eval` + `worker-src 'self' blob:`
- Option 2: uncompressed glTF, no CSP change, 3–5× download
- **AC:** whichever is chosen is recorded as an ADR amendment and in `docs/SECURITY.md`.
  Widening `script-src` to make an animation load is not an option

---

## Risks carried

`V1` CSP loosened casually · `V2` glass fails contrast · `V3` 3D reaches `/today` ·
`V4` motion causes nausea · `V5` redesign moves fetching client-side ·
`V6` placeholder mistaken for finished · `V7` mid-range Android blur jank.

Full text: `BMAD/01-analysis/VISUAL-UPGRADE-IMPACT.md` §8.
