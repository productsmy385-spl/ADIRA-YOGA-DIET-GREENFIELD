import Image from "next/image";

import { PoseIllustration, type PoseKey } from "./pose-illustration";

/**
 * The pose figure, its rings, and the panel they sit in.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * RENDERED FIGURES — NOT 3D, AND NOT CLAIMED TO BE
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * These are supplied 2D renders: one character, five poses, cut out with a real alpha
 * channel so they sit on the panel in either theme without a white box behind them. They
 * are images, not a rigged model — switching poses swaps a picture. Nothing here is the
 * 3D character `docs/3D-ASSET-CONTRACT.md` specifies, and nothing in the interface should
 * imply it is.
 *
 * `PoseIllustration` remains the fallback for any pose without a render, so a new pose
 * added to the journey degrades to a drawing rather than to an empty panel.
 *
 * ── On file size ───────────────────────────────────────────────────────────────
 * The source PNGs were ~700 KB each. Converted to WebP at q82 with `alphaQuality: 100`
 * (cutout edges go visibly crunchy below that) they are 28–55 KB — 3.56 MB down to
 * 0.18 MB across five poses. Worth knowing before anyone re-exports from the originals.
 *
 * They are deliberately NOT trimmed to their content. Every render keeps the same 1024
 * square frame, so the figure's scale and footing stay put as the reader switches poses.
 * Trimming would make each pose fill its own box and the character would jump size on
 * every selection — and Child's Pose, which is genuinely low and wide, would read as the
 * same height as Mountain.
 */

/**
 * Pose → render. A pose absent here falls back to the drawing.
 *
 * Square, subject centred, transparent background. `object-contain` letterboxes rather
 * than crops, so a non-square source would sit small rather than lose its hands.
 */
const POSE_PHOTOS: Partial<Record<PoseKey, string>> = {
  mountain: "/images/poses/mountain.webp",
  warrior: "/images/poses/warrior-2.webp",
  tree: "/images/poses/tree.webp",
  child: "/images/poses/childs-pose.webp",
  lotus: "/images/poses/lotus.webp",
};

/**
 * The concentric rings behind the figure.
 *
 * One SVG rather than three nested divs, so the circles share a coordinate system and stay
 * exactly concentric at any container size — nested elements with percentage insets drift
 * apart as the box changes shape.
 */
function Rings() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 400 400"
      className="pointer-events-none absolute inset-0 size-full"
    >
      {[186, 154, 122].map((r, i) => (
        <circle
          key={r}
          cx="200"
          cy="200"
          r={r}
          fill="none"
          stroke="var(--jade)"
          strokeOpacity={0.32 - i * 0.06}
          strokeWidth="1"
        />
      ))}
    </svg>
  );
}

export interface PoseFigureProps {
  pose: PoseKey;
  /** Only used as the photograph's alt text; the drawing is decorative and takes none. */
  label: string;
}

export function PoseFigure({ pose, label }: PoseFigureProps) {
  const photo = POSE_PHOTOS[pose];

  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-4xl border border-border-glass bg-linear-to-b from-emerald-50/70 to-white shadow-sm dark:from-emerald-950/30 dark:to-card">
      <Rings />

      {/* Two accent motes, as in the reference composition. */}
      <span
        aria-hidden
        className="absolute left-[15%] top-[19%] size-2 rounded-full bg-emerald-400/70"
      />
      <span
        aria-hidden
        className="absolute bottom-[24%] right-[17%] size-2 rounded-full bg-sky-400/60"
      />

      {photo ? (
        /*
         * `object-contain`, never `cover`. A yoga pose is defined by where the hands and
         * feet are, so a crop that trims them removes the information the image exists to
         * carry — Warrior II in particular is wider than the square it sits in.
         */
        <Image
          src={photo}
          alt={`A person holding ${label}`}
          fill
          sizes="(max-width: 1024px) 90vw, 420px"
          className="object-contain p-5"
        />
      ) : (
        <PoseIllustration pose={pose} className="relative z-10 p-5" />
      )}
    </div>
  );
}
