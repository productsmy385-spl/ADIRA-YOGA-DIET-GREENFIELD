/**
 * The 3D palette.
 *
 * WHY THIS FILE IS ALLOWED TO CONTAIN HEX AND NOTHING ELSE IS.
 *
 * `globals.css` is the single source of colour for the application, and the lint rule
 * `adira/design-tokens` makes a hex literal in `src/` an error. WebGL cannot participate
 * in that: a `three` material takes a numeric colour, not `var(--emerald)`, and there is
 * no point in the render loop where a CSS custom property could be resolved cheaply.
 *
 * So the exception is this file, listed explicitly in `eslint.config.mjs` beside
 * `branding.ts`. Every value below MIRRORS a token in `globals.css` — it is a translation
 * of the palette into a form the GPU accepts, not a second palette.
 *
 * **If a token changes in `globals.css`, change it here too.** That duplication is the
 * cost of rendering with WebGL, and keeping it in one file is what makes the cost
 * payable. Scattering `0x2f5d43` through scene components would not be.
 */

/** Mirrors `--brand-700` — the primary botanical green. */
export const FOREST = 0x2f5d43;

/** Mirrors `--emerald`. */
export const EMERALD = 0x2f7d55;

/** Mirrors `--jade`. */
export const JADE = 0x5aa17f;

/** Mirrors `--sand` (light theme). */
export const SAND = 0xe8e0cf;

/** Mirrors `--champagne` — used sparingly, as the accent is in the 2D system. */
export const CHAMPAGNE = 0xd9c48f;

/** Mirrors `--ivory`, the light-theme canvas. */
export const IVORY = 0xfbfaf6;

/** Mirrors the dark-theme `--background`. */
export const CHARCOAL = 0x1b2620;

/** Avocado green. */
export const AVOCADO = 0x7cb03c;

/** Berry red. */
export const BERRY = 0xd6385b;

/** Purple berry. */
export const PURPLE_BERRY = 0x5b38d6;

/** Water blue. */
export const WATER_BLUE = 0x389ce0;

/** Cream white. */
export const CREAM_WHITE = 0xfcfaf7;

/** Orange gold lighting. */
export const ORANGE_GOLD = 0xfdb813;

/**
 * Scene lighting, expressed as tokens rather than magic numbers at call sites.
 *
 * Warm key, cool fill: the combination that makes a matte figure read as three-
 * dimensional without the hard specular highlight that makes low-poly geometry look
 * plastic.
 */
export const LIGHT = {
  key: 0xfff6e8,
  fill: 0xdfe9f0,
  ambient: 0xffffff,
  warm: 0xfff4db,
  orangeFill: 0xe58e38,
} as const;

/**
 * Theme-aware scene colours.
 *
 * Takes the resolved theme rather than reading `document` itself, so the scene stays a
 * pure function of its props and can be rendered in a test without a DOM.
 */
export function sceneColors(theme: "light" | "dark") {
  return theme === "dark"
    ? { background: CHARCOAL, figure: JADE, ground: 0x22302a }
    : { background: IVORY, figure: EMERALD, ground: SAND };
}
