/**
 * The pose abstraction (15A).
 *
 * A pose is DATA, not a component. The seven named asanas in the seed data are examples,
 * never the schema — a pose added to `yoga_exercises` next week must appear with no code
 * change, which is why nothing here is a hardcoded list.
 *
 * Everything is derived from `model_reference` and `animation_reference`, both columns
 * that already exist. The development placeholder and the final production character use
 * the same code path, so swapping them is a data change rather than a rewrite. That is
 * what makes deferring 15C safe (ADR-014).
 */

export interface YogaPose {
  id: string;
  /** Display name, e.g. "Mountain pose". */
  name: string;
  /** Sanskrit name where the organisation records one. */
  sanskritName?: string | null;
  description?: string | null;
  /** Full instructions. The NON-3D equivalent, and never optional in the UI. */
  instructions?: string | null;
  breathing?: string | null;
  durationSeconds?: number | null;
  difficulty?: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
  /**
   * Which model to load. Null means no 3D exists for this pose — the viewer shows the
   * text equivalent, which is a legitimate state rather than an error.
   */
  modelReference?: string | null;
  /** Clip name inside the model's animation set. */
  animationReference?: string | null;
}

/**
 * The development placeholder.
 *
 * A named constant rather than a literal scattered through the components, so that
 * finding every place a placeholder is used is one search — and so removing it when 15C
 * lands is a compiler-checked exercise.
 */
export const PLACEHOLDER_MODEL = "placeholder:humanoid";

export function isPlaceholder(reference: string | null | undefined): boolean {
  return !reference || reference === PLACEHOLDER_MODEL;
}

/**
 * Resolve what a pose should render.
 *
 * Pure, so the decision is testable without a canvas. Returns the model to load and
 * whether it is the placeholder — the viewer must say so on screen rather than let a
 * development asset be mistaken for the finished experience (risk V6).
 */
export function resolveModel(pose: YogaPose): {
  reference: string;
  placeholder: boolean;
} {
  const reference = pose.modelReference ?? PLACEHOLDER_MODEL;
  return { reference, placeholder: isPlaceholder(pose.modelReference) };
}

/**
 * The text a screen reader — or anyone whose device cannot render WebGL — receives
 * instead of the scene.
 *
 * This is not a courtesy. A consultant's instruction must reach the person practising
 * regardless of their hardware, so the 3D is an enhancement of this text and never its
 * replacement. Every field a sighted user gets from the animation is present here.
 */
export function poseAlternativeText(pose: YogaPose): string {
  const parts: string[] = [pose.name];

  if (pose.sanskritName) parts.push(`(${pose.sanskritName})`);
  if (pose.durationSeconds) parts.push(`${Math.round(pose.durationSeconds / 60)} minutes`);
  if (pose.instructions) parts.push(pose.instructions);
  if (pose.breathing) parts.push(`Breathing: ${pose.breathing}`);

  return parts.join(". ");
}

/**
 * The seven-section journey (15B).
 *
 * Section order is fixed because it is a narrative — assessment through to rest — but the
 * POSES shown in each come from the database. The arc is the product's; the content is
 * the organisation's.
 */
export const JOURNEY_SECTIONS = [
  { id: "hero", title: "Begin", body: "A practice built around you." },
  { id: "breathing", title: "Breathe", body: "Everything starts with the breath." },
  { id: "movement", title: "Move", body: "Gentle sequences that build a habit." },
  { id: "strength", title: "Strengthen", body: "Steady progress, never strain." },
  { id: "balance", title: "Balance", body: "Stability you can feel week to week." },
  { id: "meditation", title: "Still", body: "Rest is part of the programme." },
  { id: "wellness", title: "Continue", body: "Your progress, recorded honestly." },
] as const;

export type JourneySectionId = (typeof JOURNEY_SECTIONS)[number]["id"];
