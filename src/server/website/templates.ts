import type { FontPairing, PalettePreset } from "./content";

/**
 * The eight website templates (WEBSITE-BUILDER-PRD §4) — metadata only.
 *
 * Kept here, server-side and framework-free, because the KEY is validated on every write
 * and stored in the database: the list of valid keys must not depend on importing React.
 * The layouts themselves live in `src/components/website/templates/`.
 */

export const TEMPLATE_KEYS = [
  "minimal",
  "retreat",
  "fitness",
  "holistic",
  "nutrition",
  "premium",
  "community",
  "corporate",
] as const;
export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

export interface TemplateMeta {
  key: TemplateKey;
  name: string;
  description: string;
  /** What makes it structurally different — shown in the gallery. */
  layout: string;
  defaultPalette: PalettePreset;
  defaultFont: FontPairing;
}

export const TEMPLATES: readonly TemplateMeta[] = [
  {
    key: "minimal",
    name: "Wellness Minimal",
    description: "Clean, calm and text-led, on white and mint.",
    layout: "Single column, large type, hairline dividers",
    defaultPalette: "mint",
    defaultFont: "modern",
  },
  {
    key: "retreat",
    name: "Yoga Retreat",
    description: "Emerald and turquoise, built around classes and instructors.",
    layout: "Full-bleed image hero, class-style grid, instructor cards",
    defaultPalette: "emerald",
    defaultFont: "friendly",
  },
  {
    key: "fitness",
    name: "Modern Fitness",
    description: "Bold green and blue with strong calls to action.",
    layout: "Split hero, highlight strip, alternating feature rows",
    defaultPalette: "bold",
    defaultFont: "modern",
  },
  {
    key: "holistic",
    name: "Holistic Wellness",
    description: "Lavender and mint, soft organic shapes, meditative pace.",
    layout: "Organic shapes, centred narrative sections",
    defaultPalette: "lavender",
    defaultFont: "editorial",
  },
  {
    key: "nutrition",
    name: "Nutrition Studio",
    description: "Warm orange and yellow, made for diet and meal programmes.",
    layout: "Menu-style offerings list, warm accent bands",
    defaultPalette: "citrus",
    defaultFont: "friendly",
  },
  {
    key: "premium",
    name: "Premium Wellness",
    description: "Dark navy with emerald accents and editorial typography.",
    layout: "Dark surfaces, serif display, editorial two-column story",
    defaultPalette: "navy",
    defaultFont: "classic",
  },
  {
    key: "community",
    name: "Community Wellness",
    description: "Friendly and people-first, with team and community up front.",
    layout: "Team-first layout, photo mosaic",
    defaultPalette: "sunrise",
    defaultFont: "friendly",
  },
  {
    key: "corporate",
    name: "Corporate Wellness",
    description: "Professional and structured for workplace programmes.",
    layout: "Navigation header, programme table, formal footer",
    defaultPalette: "slate",
    defaultFont: "classic",
  },
];

export const DEFAULT_TEMPLATE: TemplateKey = "minimal";

export function templateMeta(key: string): TemplateMeta | undefined {
  return TEMPLATES.find((t) => t.key === key);
}
