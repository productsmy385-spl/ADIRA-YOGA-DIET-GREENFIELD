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
   * PLACEHOLDER: redrawn from the mark in the supplied architecture posters, not from a
   * source asset. Replace when the official logo file arrives — see docs/BRANDING.md.
   *
   * SVG only for now. The raster set an install prompt wants — 192/512 PNG plus a
   * maskable variant with safe-zone padding — is Phase 14's job, and generating it from
   * a placeholder would mean regenerating it all again from the real logo.
   */
  icons: {
    mark: "/brand/mark.svg",
    favicon: "/icon.svg",
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
