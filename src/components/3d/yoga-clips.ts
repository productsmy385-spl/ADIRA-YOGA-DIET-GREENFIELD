/**
 * Animation clip names, and what to play when the one asked for is not there.
 *
 * Pure — no `three`, no canvas — so the resolution rules are exhaustively testable and so
 * importing this costs nothing. `yoga-model.tsx` holds the parts that need a GPU.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THE NAMES BELOW ARE A CONTRACT WITH TWO PARTIES AT ONCE
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * They are what `docs/3D-ASSET-CONTRACT.md` §5 requires an artist to deliver, and they are
 * what goes verbatim into `yoga_exercises.animation_reference`. Changing a name here
 * silently breaks whichever of the two was not changed with it, so the list is duplicated
 * nowhere else and `yoga-clips.test.ts` asserts it matches the contract document.
 *
 * This list is NOT a validator. An organisation may reference a clip we have never heard
 * of, and a future asset may add clips we did not specify — both are fine, and both are
 * resolved by `resolveClip` rather than rejected.
 */

/**
 * The clips the asset contract requires.
 *
 * Order is the narrative order, not an priority: `resolveClip` does not read it.
 */
export const CONTRACT_CLIPS = [
  "idle-breathing",
  "mountain",
  "forward-fold",
  "tree-left",
  "tree-right",
  "warrior-1-left",
  "warrior-1-right",
  "seated-meditation",
  "child-pose",
  "transition-in",
  "transition-out",
] as const;

export type ContractClip = (typeof CONTRACT_CLIPS)[number];

/**
 * What plays when nothing better is available.
 *
 * `idle-breathing` rather than the first clip in the file, because a character that
 * breathes reads as present and calm, while one frozen in Warrior I reads as broken. The
 * contract marks it required for exactly this reason.
 */
export const DEFAULT_CLIP = "idle-breathing";

/**
 * Which clip to actually play.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * A MISSING CLIP MUST NEVER TAKE DOWN THE YOGA EXPERIENCE
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * There are three ordinary ways to arrive here without the requested clip, none of them a
 * bug worth crashing over:
 *
 *   - the pose has no `animation_reference` at all, which is the common case early on
 *   - an artist delivered nine of the eleven contracted clips
 *   - an organisation typed a name that does not exist in their asset
 *
 * So the order is: what was asked for → the idle clip → whatever exists → nothing. The
 * last case still renders the character; it simply stands in its bind pose, which is worse
 * than an animation and far better than a blank rectangle where a person expected guidance.
 *
 * Returns `null` only when the asset genuinely contains no clips.
 */
export function resolveClip(
  requested: string | null | undefined,
  available: readonly string[],
): string | null {
  if (available.length === 0) return null;

  if (requested && available.includes(requested)) return requested;
  if (available.includes(DEFAULT_CLIP)) return DEFAULT_CLIP;

  return available[0];
}

/**
 * Did the asset deliver what the contract asked for?
 *
 * Not used to gate rendering — a partial asset still works. It exists so the acceptance
 * check in `docs/3D-ASSET-CONTRACT.md` §7 can be run against a real delivery instead of
 * being eyeballed, and so a report can name exactly which clips are absent.
 */
export function auditClips(available: readonly string[]): {
  missing: ContractClip[];
  extra: string[];
  complete: boolean;
} {
  const present = new Set(available);
  const missing = CONTRACT_CLIPS.filter((clip) => !present.has(clip));
  const contracted = new Set<string>(CONTRACT_CLIPS);
  const extra = available.filter((clip) => !contracted.has(clip));

  return { missing, extra, complete: missing.length === 0 };
}
