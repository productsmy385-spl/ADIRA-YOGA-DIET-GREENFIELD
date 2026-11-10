import { z } from "zod";

import { TEMPLATE_KEYS, type TemplateKey } from "./templates";

/**
 * The website content document (WEBSITE-BUILDER-PRD §3) — pure, so it is testable.
 *
 * ONE document per organisation, read by all eight templates. A template is presentation;
 * it never owns content, which is why switching template cannot lose anything (FR-WEB-003).
 *
 * Two levels of validation, on purpose:
 *   - `websiteContentSchema` (draft): shape and length limits only. Half-finished work must
 *     always save — an autosave that rejects an empty heading loses the user's typing.
 *   - `publishProblems` (publish): the completeness rules of PRD §7, reported per field.
 *
 * SAFETY (NFR-SEC-WEB-003). Everything here is plain text. No field is ever rendered as
 * HTML, and every link must be https:, mailto: or tel: — so one tenant cannot turn their
 * public page into a script or phishing redirect against visitors.
 */

export const CONTENT_SCHEMA_VERSION = 1;

/* ── primitives ─────────────────────────────────────────────────────────── */

const text = (max: number) => z.string().trim().max(max).default("");

/** `https:`, `mailto:`, `tel:` only. `javascript:`, `data:`, `http:` and relative are refused. */
export function isSafeLink(value: string): boolean {
  if (value === "") return true;
  if (/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(value)) return true;
  if (/^tel:\+?[0-9 ()-]{5,20}$/.test(value)) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.includes(".");
  } catch {
    return false;
  }
}

const link = z
  .string()
  .trim()
  .max(500)
  .default("")
  .refine(isSafeLink, { message: "Links must start with https://, mailto: or tel:" });

const HEX = /^#[0-9a-f]{6}$/i;

/**
 * An image chosen from the organisation's own website media.
 * `assetId` is authoritative; `url` is filled in by the server from `media_assets` after it
 * has checked the asset belongs to this organisation (never trusted from the client).
 */
const image = z
  .object({
    assetId: z.uuid().nullable().default(null),
    url: z.string().max(1000).nullable().default(null),
    alt: text(200),
  })
  .prefault({});

const cta = z
  .object({ label: text(40), href: link })
  .prefault({});

/* ── sections ───────────────────────────────────────────────────────────── */

export const SERVICE_KEYS = [
  "yoga",
  "meditation",
  "pranayama",
  "diet",
  "personal-training",
  "programmes",
] as const;
export type ServiceKey = (typeof SERVICE_KEYS)[number];

export const SERVICE_LABELS: Record<ServiceKey, string> = {
  yoga: "Yoga",
  meditation: "Meditation",
  pranayama: "Pranayama",
  diet: "Diet consultation",
  "personal-training": "Personal training",
  programmes: "Wellness programmes",
};

export const SECTION_IDS = ["hero", "about", "services", "team", "offerings", "contact"] as const;
export type SectionId = (typeof SECTION_IDS)[number];

export const PALETTE_PRESETS = [
  "mint",
  "emerald",
  "bold",
  "lavender",
  "citrus",
  "navy",
  "sunrise",
  "slate",
] as const;
export type PalettePreset = (typeof PALETTE_PRESETS)[number];

export const FONT_PAIRINGS = ["modern", "editorial", "friendly", "classic"] as const;
export type FontPairing = (typeof FONT_PAIRINGS)[number];

export const websiteContentSchema = z.object({
  schemaVersion: z.literal(CONTENT_SCHEMA_VERSION).default(CONTENT_SCHEMA_VERSION),

  branding: z
    .object({
      businessName: text(120),
      tagline: text(160),
      logo: image,
      favicon: image,
      cover: image,
      palette: z.enum(PALETTE_PRESETS).nullable().default(null),
      customColor: z
        .string()
        .trim()
        .default("")
        .refine((v) => v === "" || HEX.test(v), { message: "Use a six-digit colour code from your brand guide" }),
      font: z.enum(FONT_PAIRINGS).nullable().default(null),
    })
    .prefault({}),

  hero: z
    .object({ heading: text(120), text: text(400), image, primary: cta, secondary: cta })
    .prefault({}),

  about: z
    .object({ intro: text(1200), mission: text(1200), philosophy: text(1200) })
    .prefault({}),

  services: z
    .array(
      z.object({
        key: z.enum(SERVICE_KEYS),
        enabled: z.boolean().default(true),
        description: text(400),
      }),
    )
    .max(SERVICE_KEYS.length)
    .default([])
    .refine((list) => new Set(list.map((s) => s.key)).size === list.length, {
      message: "Each service may appear once",
    }),

  team: z
    .array(
      z.object({
        name: text(80),
        role: text(80),
        photo: image,
        qualifications: text(300),
        specialisations: text(300),
      }),
    )
    .max(24)
    .default([]),

  /** Typed by the Admin — never pulled from internal programmes (PRD decision). */
  offerings: z
    .array(
      z.object({
        name: text(80),
        description: text(400),
        duration: text(60),
        price: text(40),
      }),
    )
    .max(24)
    .default([]),
  pricingEnabled: z.boolean().default(false),

  contact: z
    .object({
      phone: text(30),
      email: z
        .string()
        .trim()
        .max(200)
        .default("")
        .refine((v) => v === "" || z.email().safeParse(v).success, { message: "Enter a valid email" }),
      address: text(300),
      mapsUrl: link,
    })
    .prefault({}),

  social: z
    .object({
      instagram: link,
      facebook: link,
      youtube: link,
      x: link,
      linkedin: link,
      whatsapp: link,
    })
    .prefault({}),

  footer: z.object({ text: text(300) }).prefault({}),

  seo: z.object({ title: text(70), description: text(160) }).prefault({}),

  /** Order and visibility. Array order IS display order. */
  sections: z
    .array(z.object({ id: z.enum(SECTION_IDS), visible: z.boolean().default(true) }))
    .default([])
    .transform(normaliseSections),
});

export type WebsiteContent = z.output<typeof websiteContentSchema>;

/**
 * Every section exactly once: unknown/duplicate entries dropped, missing ones appended
 * (visible). A stored document from before a section existed still renders completely.
 */
function normaliseSections(list: Array<{ id: SectionId; visible: boolean }>) {
  const seen = new Set<SectionId>();
  const out: Array<{ id: SectionId; visible: boolean }> = [];
  for (const entry of list) {
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    out.push(entry);
  }
  for (const id of SECTION_IDS) if (!seen.has(id)) out.push({ id, visible: true });
  return out;
}

/** A complete, valid starting document for a new organisation. */
export function defaultContent(organizationName: string): WebsiteContent {
  return websiteContentSchema.parse({
    branding: { businessName: organizationName },
    hero: {
      heading: organizationName,
      primary: { label: "", href: "" },
    },
    services: SERVICE_KEYS.slice(0, 4).map((key) => ({ key, enabled: true, description: "" })),
  });
}

/** Parse untrusted input (a client draft, or a stored document) into the current shape. */
export function parseContent(
  input: unknown,
): { ok: true; content: WebsiteContent } | { ok: false; problems: FieldProblem[] } {
  const parsed = websiteContentSchema.safeParse(input);
  if (parsed.success) return { ok: true, content: parsed.data };
  return {
    ok: false,
    problems: parsed.error.issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
    })),
  };
}

/* ── publish rules (PRD §7) ─────────────────────────────────────────────── */

export interface FieldProblem {
  field: string;
  message: string;
}

export function publishProblems(content: WebsiteContent, templateKey: string): FieldProblem[] {
  const problems: FieldProblem[] = [];
  const need = (ok: boolean, field: string, message: string) => {
    if (!ok) problems.push({ field, message });
  };

  need(TEMPLATE_KEYS.includes(templateKey as TemplateKey), "template", "Choose a template");
  need(content.branding.businessName !== "", "branding.businessName", "Add your business name");
  need(content.hero.heading !== "", "hero.heading", "Add a main heading");

  const { phone, email, address } = content.contact;
  need(phone !== "" || email !== "" || address !== "", "contact", "Add at least one way to contact you");
  need(phone === "" || /^\+?[0-9 ()-]{5,20}$/.test(phone), "contact.phone", "Enter a valid phone number");

  // Alt text is required on every image that is actually set (NFR-A11Y-WEB-001).
  const images: Array<[string, { url: string | null; alt: string }]> = [
    ["branding.logo", content.branding.logo],
    ["branding.cover", content.branding.cover],
    ["hero.image", content.hero.image],
    ...content.team.map((m, i) => [`team.${i}.photo`, m.photo] as [string, typeof m.photo]),
  ];
  for (const [field, img] of images) {
    need(!img.url || img.alt !== "", `${field}.alt`, "Describe this image for people who can't see it");
  }

  for (const [i, member] of content.team.entries()) {
    need(member.name !== "", `team.${i}.name`, "Each team member needs a name");
  }
  for (const [i, offering] of content.offerings.entries()) {
    need(offering.name !== "", `offerings.${i}.name`, "Each offering needs a name");
  }
  for (const [key, c] of [["hero.primary", content.hero.primary], ["hero.secondary", content.hero.secondary]] as const) {
    need((c.label === "") === (c.href === ""), key, "A button needs both a label and a link");
  }

  return problems;
}

/* ── colour (FR-WEB-005) ────────────────────────────────────────────────── */

function relativeLuminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

export function contrastRatio(hexA: string, hexB: string): number {
  const [a, b] = [relativeLuminance(hexA), relativeLuminance(hexB)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}

/** Relative luminance of white and of the near-black site ink (CSS token `--site-ink-dark`). */
const WHITE_LUMINANCE = 1;
const INK_DARK_LUMINANCE = 0.0056;

/**
 * Which ink to put on a custom brand fill, and whether the brand colour may itself be used
 * as text on white. Any colour reaches AA (4.5:1) against either near-black or white, so
 * the fill is always usable; using it AS text is only allowed when it passes on white.
 *
 * Returns ink NAMES, not colours: the values live in globals.css (invariant 7).
 */
export function brandColorUsage(hex: string): { foreground: "light" | "dark"; usableAsText: boolean } {
  const l = relativeLuminance(hex);
  const onWhite = (WHITE_LUMINANCE + 0.05) / (l + 0.05);
  const onDark = (l + 0.05) / (INK_DARK_LUMINANCE + 0.05);
  return { foreground: onWhite >= onDark ? "light" : "dark", usableAsText: onWhite >= 4.5 };
}
