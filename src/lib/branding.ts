import { clientEnv } from "./env.client";

/**
 * Product identity in one place.
 *
 * "Adira" is a working name. Every user-visible occurrence of it resolves through this
 * module, fed by NEXT_PUBLIC_APP_NAME, so renaming the product is a configuration change
 * rather than a find-and-replace across the codebase. This mirrors TaskFlow HR's
 * `src/lib/branding.ts`, which exists for the same reason.
 *
 * Do not hardcode the product name in a component, a page title, an email template, or a
 * report header. Import it from here.
 */

export const branding = {
  /** Product name as shown to users. */
  name: clientEnv.NEXT_PUBLIC_APP_NAME,

  /** One-line positioning, used in metadata and the install prompt. */
  tagline: "Yoga therapy and wellness, guided end to end",

  /** Longer description for metadata and the PWA manifest. */
  description:
    "Personalised yoga and diet programmes, daily activity tracking, and progress " +
    "reporting for wellness organisations and the people they care for.",

  /** Absolute origin. Used for canonical URLs and absolute asset paths. */
  url: clientEnv.NEXT_PUBLIC_APP_URL,

  /**
   * Icon set.
   *
   * THE OFFICIAL LOGO, supplied 2026-09-11 — no longer the redrawn placeholder this
   * comment used to apologise for.
   *
   * Derived from one 1217×1292 RGBA source, which is why the two agree exactly:
   *
   *   mark  the meditating figure and its aura ring, WITHOUT the wordmark, trimmed to
   *         content and letterboxed into a 512² transparent square. Square because every
   *         place it renders is square — a 40px header slot, a favicon, a PWA tile — and
   *         a lockup scaled into those is an illegible smudge.
   *   logo  the full lockup including "Adira / Wellness in Balance", for anywhere with
   *         room for it.
   *
   * `src/app/icon.png` is the same 512² mark. Next's file convention emits the favicon
   * link from it, so the tab icon and the header cannot drift apart.
   *
   * Kept as PNG rather than SVG: the source is a raster render with gradients, glow and
   * soft shadow. Tracing it to SVG would either balloon the file or lose the glow, and at
   * 59KB there is nothing to win.
   */
  icons: {
    mark: "/brand/adira-mark.png",
    logo: "/brand/adira-logo.png",
    favicon: "/brand/adira-mark.png",
  },

  /**
   * Theme colour for the browser chrome and PWA manifest.
   * Mirrors --brand-700 in globals.css. If that token changes, change this with it —
   * it is the one place a brand colour is necessarily duplicated, because the manifest
   * and the meta tag cannot read a CSS custom property.
   */
  themeColor: "#2f5d43",
  backgroundColor: "#fbfaf6",
} as const;

export type Branding = typeof branding;
