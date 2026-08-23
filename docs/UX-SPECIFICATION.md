# UX Specification — Botanical Wellness Glass

The design system for Adira. Premium, calm, natural, trustworthy — a wellness platform
that happens to be high-end SaaS, not a SaaS dashboard with plants on it.

This document is the contract. A component that invents its own glass, its own blur
radius, or its own green is a bug, not a variation.

**BMAD Phase 3 (UX).** Impact and constraints: `BMAD/01-analysis/VISUAL-UPGRADE-IMPACT.md`.

---

## 1. The one idea

**Depth through light, not through decoration.**

Surfaces are distinguished by how much light passes through them, not by borders, drop
shadows, or colour changes. A calmer surface is more transparent; a surface asking for
attention is more solid. That single rule produces the hierarchy in §3 and keeps the
interface legible when everything is translucent.

The botanical layer is *ambient* — soft organic shapes and gradients behind the glass,
never in front of content, never animated in a way that competes with reading.

---

## 2. Colour

Extends the existing tokens in `src/app/globals.css`. **Existing names do not change** —
renaming them would touch every component for no user-visible gain
(`VISUAL-UPGRADE-IMPACT.md` §6).

### Palette direction

| Role | Direction |
|---|---|
| Primary | Deep forest → emerald |
| Secondary | Sage, jade |
| Surface | Warm ivory (light), deep charcoal-green (dark) |
| Accent | Subtle champagne / gold — used sparingly, for achievement only |
| Sand | Natural sand, for large calm areas |
| Danger | Muted terracotta |

Gold is the scarcest colour in the system. If it appears on more than one element per
screen it has stopped meaning anything.

### New semantic tokens

Added alongside the existing set:

```
--surface                 opaque card/panel base
--surface-glass           translucent, level 1
--surface-glass-strong    translucent, level 2
--border-glass            hairline for glass edges

--success  --warning  --danger  --info
```

`--danger` is **defined in terms of** `--destructive`, not given its own value. One
source, two names, no drift. Same for any other alias.

### Contrast rule — the important one

**Text never sits on unbounded glass.**

A glass surface's effective contrast depends on what is behind it, which changes as the
page scrolls. A card passing 4.5:1 over the hero can fail over a bright botanical shape
200 px later.

So: glass provides the **edge and depth**; text sits on a defined surface token behind the
blur. Contrast is then computed against a known colour and is testable.

Targets: **4.5:1** body text, **3:1** large text and meaningful non-text (focus rings,
status dots), in **both** themes. Verified by an automated token-pair check in 15D, not by
eye.

---

## 3. Elevation — five levels

Per §22. This is what stops a fully translucent interface reading as flat.

| Level | Name | Treatment | Used for |
|---|---|---|---|
| 0 | Canvas | Base gradient + botanical shapes + noise | Page background |
| 1 | Glass | `--surface-glass`, blur 12px, hairline border | Cards, list rows, sidebar |
| 2 | Panel | `--surface-glass-strong`, blur 16px, stronger border | Dialogs, sheets, popovers |
| 3 | Interactive | Level 1/2 + hover lift, border brightens | Buttons, inputs, tappable cards |
| 4 | Focused | Ring in `--ring`, highest opacity | Active field, open menu, keyboard focus |

**Blur budget: at most two blurred layers may overlap.** Stacked `backdrop-filter` is a
real cost on the mid-range Android our customers use (`PRODUCT-CONTEXT.md`), and it shows
up as scroll jank rather than as a rendering error. A dialog (level 2) over a page is
already two; the page behind it must not add a third.

---

## 4. Glass primitives

Implemented once, in `src/components/glass/`. **No component implements its own glass.**

```
GlassCard      GlassPanel     GlassDialog    GlassSheet
GlassNavbar    GlassSidebar   GlassMetric    GlassButton
GlassInput     GlassSelect    GlassTable     GlassChartContainer
```

Each takes a `level` and derives everything from tokens. A one-off `backdrop-blur-[13px]`
in a feature component is the failure this list exists to prevent.

`GlassDialog` wraps the existing `FormDialog`, which already carries the §23 requirements
— title, description, validation, loading, error, cancel, confirm, focus management, and
the double-submit guard. **That behaviour is not re-implemented**; it gains a surface.

On mobile, `GlassDialog` renders as `GlassSheet` (bottom sheet) below the `sm` breakpoint.
A centred dialog on a small screen fights the keyboard.

---

## 5. Background system

Layered, CSS-only where possible:

```
base gradient  →  botanical shapes (inline SVG, blurred)  →  noise (SVG turbulence,
tiled, ~3% opacity)  →  ambient glow  →  content
```

No large raster backgrounds — they cost more than the effect is worth on a slow
connection, and they cannot respond to the theme.

The background does not animate on its own. Ambient movement competes with reading, and
for a customer opening the app at 5 am it is actively unpleasant.

---

## 6. Typography

The existing Geist / Geist Mono setup stays; the hierarchy is what changes.

| Role | Treatment |
|---|---|
| Display | Hero only. Tight tracking, balanced wrap, generous size |
| Heading | Section titles. Semibold, tight tracking |
| Body | Relaxed line height — this is health guidance people read carefully |
| Metric | Tabular numerals, so an animating number does not shift width |
| Meta | Small, muted, wide tracking, uppercase — labels and timestamps |

Tabular numerals are not cosmetic: §17's counting animation reflows the whole card on
every frame without them.

---

## 7. Motion

Motion communicates **state or hierarchy**. Anything else is noise.

| Element | Motion |
|---|---|
| Card entry | Fade + 8px rise, staggered ~40ms |
| Hover | 2px lift, border brightens, 150ms |
| Metric | Count from previous value → real value, ~600ms |
| Progress ring | Sweep to value once, on first paint |
| Dialog | Scale 0.97→1 with fade, 180ms |
| Page transition | Cross-fade only |

**Never animate a metric from a fake starting value.** The number counts from the previous
*real* value, or from zero on first load. It never displays an invented figure mid-flight
— and a `null` metric renders `—`, never an animated `0%` (`docs/METRICS.md`).

### Reduced motion

`prefers-reduced-motion: reduce` is already honoured globally in `globals.css`. Under it:

- no scroll-driven camera movement — the 3D scene shows a **static representative pose**
- no counting; metrics render final values immediately
- no parallax, no card stagger
- transitions collapse to opacity, or nothing

Reduced motion must never reduce **information**. Everything remains reachable.

---

## 8. Navigation

Role-aware, `GlassNavbar` on desktop / `GlassSidebar` where dense, bottom tab bar on
mobile for customers.

| Role | Items |
|---|---|
| Customer | Today · Yoga · Diet · Progress · Reports · Notifications · Profile |
| Admin | Caseload · Members · Yoga · Diet · Activities · Reports · Notifications |
| Org owner | Admin items + Analytics · Settings |
| Platform owner | Organisations · Health · Audit |

> **Hiding a link is not authorization.** Navigation reflects role for usability only.
> Every route keeps its server-side guard (`requireRole`, `canViewCustomer`), and every
> repository call keeps its `organizationId`. A user who types the URL still gets the same
> 404 or redirect they get today.

---

## 9. 3D experience

Architecture in `src/components/3d/`, per §7:

```
YogaScene  YogaCharacter  YogaPose  YogaSequence
YogaCamera YogaLighting   YogaEnvironment  YogaFallback
```

**No model is hardcoded.** Scenes take a `model_reference`, which already exists on
`yoga_exercises` (migration 004). Placeholder and production asset are the same code path.

### Pose abstraction

Poses come from the database, never a hardcoded list:

```
id · name · description · duration · difficulty
animationReference · modelReference · instructions
```

Tadasana, Vrikshasana, Bhujangasana, Adho Mukha Svanasana, Balasana, Trikonasana and
Shavasana are **seed data**, not the set of possible poses.

### Where 3D appears

| Surface | 3D |
|---|---|
| Landing | Full scroll-driven journey |
| Customer `/today` | One small pose preview, lazy, below the fold |
| Yoga detail | Single interactive pose viewer |
| Admin | Lightweight static preview only — this is a productivity surface |
| Owner / platform | **None.** Charts and glass; 3D would reduce productivity |

`/today` must not carry the 3D bundle in its initial render. The daily loop is the journey
the product lives on, and a slower one is a net loss however it looks.

### Scroll journey

Seven sections, one continuous camera path: Hero → Breathing → Movement → Strength →
Balance → Meditation → Wellness. Scroll drives camera position, pose timeline, lighting
and environment — not seven unrelated effects that happen to fire on scroll.

### Fallbacks

```
WebGL unavailable  →  static pose image + full text
Slow device        →  reduced pose set, no environment
Asset fails        →  YogaFallback, page fully functional
Reduced motion     →  static pose, no camera movement
```

**Every 3D element has a non-3D equivalent carrying the same information** — name, Sanskrit
name, duration, instructions. 3D is never the only carrier. That is an accessibility
requirement and also a correctness one: a consultant's instruction must reach someone whose
device cannot render it.

---

## 10. Loading and empty states

Skeletons match the shape of what is coming — same dimensions, same layout — so nothing
shifts when data lands.

Empty states distinguish **"nothing yet"** from **"something went wrong"**. `/today`
already does this and it is the pattern: *"Your consultant has not assigned a programme
yet… Nothing is wrong."*

---

## 11. Definition of done for this system

- [ ] Tokens declared once; no hex outside `globals.css` (lint already enforces)
- [ ] Every glass surface uses a primitive from `components/glass/`
- [ ] At most two overlapping blurred layers anywhere
- [ ] Contrast verified for every token pair, both themes, automated
- [ ] Reduced motion removes movement, never information
- [ ] Every 3D element has a text equivalent
- [ ] `/today` initial bundle contains no 3D
- [ ] Server-side fetching and guards unchanged
- [ ] Production 3D assets integrated (**15C — blocked on art**)
