# Branding

## The name is configuration

"Adira" is a working name, held in `src/lib/branding.ts` and fed by
`NEXT_PUBLIC_APP_NAME`. Every user-visible occurrence resolves through that module, so
renaming the product is a configuration change rather than a find-and-replace.

Do not hardcode the product name in a component, page title, email template, or report
header. Import it.

## The logo is a placeholder

**The official logo has not been supplied.** The mark in `public/brand/mark.svg` and
`src/app/icon.svg` was redrawn from the lotus-and-seated-figure mark that appears in the
top-left corner of the two architecture posters provided at project start. It is a
reasonable stand-in, not the real asset.

When the source file arrives:

1. Replace `public/brand/mark.svg` — keep it `currentColor` so it works in both themes
   from one file.
2. Replace `src/app/icon.svg`, which bakes in the brand green because a favicon has no
   surrounding text to inherit from.
3. Generate the raster set (below).
4. Delete this section.

### Raster icons are Phase 14's job

Only SVG exists today. An install prompt wants 192px and 512px PNGs plus a maskable
variant with safe-zone padding, and `public/manifest.webmanifest` currently declares the
SVG alone.

Generating that set from a placeholder would mean generating it all again from the real
logo, so Phase 14 (PWA) owns it — by which point the real mark should exist.

## Colour

Defined once, in `src/app/globals.css`, as OKLCH custom properties. Components use
semantic tokens (`bg-primary`, `text-muted-foreground`, `bg-status-complete`), never raw
values. A hex literal anywhere in `src/` is an ESLint error.

| Role | Direction |
|---|---|
| Primary | deep botanical green |
| Secondary / rest state | sage, olive |
| Surface | warm ivory |
| Destructive / missed | muted terracotta |
| Accent / pending | subtle saffron |
| Foreground | deep charcoal |

OKLCH because it keeps perceived lightness stable across hues, which is what makes the
light and dark ramps read as one palette rather than two.

### Two deliberate exceptions

A brand colour is necessarily literal in exactly two places, because neither can read a
CSS custom property:

- `src/lib/branding.ts` — `themeColor` and `backgroundColor` for the browser chrome and
  the PWA manifest.
- `src/app/icon.svg` and `public/manifest.webmanifest`.

Both mirror `--brand-700` / the ivory surface. **If those tokens change, change these
with them.** `branding.ts` is exempted from the lint rule for this reason.

### Status tokens

`--status-complete`, `--status-pending`, `--status-missed`, `--status-rest` are named for
meaning rather than colour, so the activity engine renders a state without a component
deciding what "missed" looks like.

## Dialog and form standard

§28 of the brief sets requirements every dialog must meet: title and description,
validation, loading/error/success states, cancel, destructive confirmation, keyboard
accessibility, focus management, and a mobile layout.

Those are met **once**, in `src/components/form-dialog.tsx`, rather than re-met by every
feature that opens a dialog — "every dialog handles its own error state" is a promise
that holds until the first one that does not. Use `FormDialog` rather than composing
`Dialog` directly, unless a surface genuinely cannot.

Four behaviours it guarantees, each covered by a test in `form-dialog.test.tsx`:

- **A submission cannot start twice.** The guard is a ref, not the `pending` state.
  React batches updates, so two clicks in one tick both observe `pending === false` and
  both submit. A human cannot click twice inside a frame, but a phone double-tap or a
  held Enter key can — which is why this is invisible in manual testing.
- **Failure keeps the dialog open with input intact.** Closing on error discards what
  the user typed; for a consultation note that is destructive.
- **The error is announced**, via `role="alert"`. Without it a sighted user sees red
  text and a screen-reader user sees nothing.
- **Dismissal is blocked mid-write.** Escape, overlay click, and the close button all go
  inert while pending, because closing mid-write leaves the user unsure whether it
  landed.

One trap worth knowing, because it cost a bug here: do **not** set `aria-describedby` on
`DialogContent`. Radix wires it to `DialogDescription` automatically, and passing the
prop — even as `undefined` — silently strips the dialog's accessible description.

## Motion

`prefers-reduced-motion: reduce` is honoured globally in `globals.css`. This is wellness
software; it should not be the thing that triggers someone's vestibular symptoms.

## Typography

Geist and Geist Mono via `next/font`, bound to `--font-sans` and `--font-mono`.

## Still to decide

- Whether organizations may white-label — their own logo and accent within the Adira
  shell. The `organizations` table has no branding columns yet; adding them is cheap
  later, but the design system would need a per-tenant token layer, which is not cheap.
- Full accessibility audit, including contrast verification of every token pair in both
  themes. Phase 17 owns it.
