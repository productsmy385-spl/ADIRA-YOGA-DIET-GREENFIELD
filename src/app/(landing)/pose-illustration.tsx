/**
 * Illustrated 2D yoga figures — the replacement for the primitive 3D geometry.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THIS IS NOT 3D
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `docs/3D-ASSET-CONTRACT.md` is unambiguous: no production character asset exists,
 * and one cannot be written — it is a rigged GLB that has to be commissioned against
 * §2–§5 of that contract. What the landing page had instead was capsules and spheres
 * with lerped limb rotations, which reads as a geometry demo rather than a wellness
 * product.
 *
 * A drawn figure is the honest middle. It has real human proportions, it cannot crop
 * or misalign because an SVG `viewBox` scales as a unit, and it costs no WebGL context
 * on a mid-range Android. When 15C lands, this component is what the GLB replaces —
 * and until then nothing on screen pretends to be a character that does not exist.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * HOW A POSE IS DEFINED
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Each pose is a set of JOINT COORDINATES, not a hand-authored silhouette path. Posing
 * is then moving a joint, which is reviewable; editing raw path data is not. Limbs are
 * drawn as round-capped strokes whose width tapers at the elbow and knee, so the joints
 * read as anatomy rather than as hinges.
 *
 * Coordinates live in a 400×400 box with the floor at y=340. Left-side limbs are drawn
 * BEHIND the torso and slightly darker, which is the whole of the depth cue and is
 * enough at this scale.
 *
 * Colour comes from `globals.css` tokens via `var(--…)`. SVG paint accepts custom
 * properties, so invariant 7 holds here exactly as it does in CSS — no hex literal.
 */

import { cn } from "@/lib/utils";

export type PoseKey = "mountain" | "warrior" | "tree" | "child" | "lotus";

type Point = readonly [number, number];

interface Skeleton {
  head: Point;
  /** Degrees. The head is an ellipse, so it has to be told where to look. */
  headTilt: number;
  neck: Point;
  shoulderL: Point;
  shoulderR: Point;
  elbowL: Point;
  elbowR: Point;
  wristL: Point;
  wristR: Point;
  hipL: Point;
  hipR: Point;
  kneeL: Point;
  kneeR: Point;
  ankleL: Point;
  ankleR: Point;
  /** Where the mat sits, and how wide. Child's pose needs a wider one than Tree. */
  matWidth: number;
  /**
   * Floor height. Seated poses sit well above the standing floor line, and a mat drawn
   * at ankle height under crossed legs reads as the figure hovering.
   */
  matY?: number;
}

const SKELETONS: Record<PoseKey, Skeleton> = {
  /* Tadasana — grounded, symmetrical, arms open a few degrees from the ribs. */
  mountain: {
    head: [200, 80],
    headTilt: 0,
    neck: [200, 110],
    shoulderL: [176, 124],
    shoulderR: [224, 124],
    elbowL: [166, 176],
    elbowR: [234, 176],
    wristL: [160, 226],
    wristR: [240, 226],
    hipL: [186, 208],
    hipR: [214, 208],
    kneeL: [188, 272],
    kneeR: [212, 272],
    ankleL: [190, 334],
    ankleR: [210, 334],
    matWidth: 120,
  },

  /* Virabhadrasana II — wide stance, front knee stacked over the ankle, arms level,
     gaze over the front hand. The back foot stays flat, so the back leg is straight. */
  warrior: {
    head: [186, 90],
    headTilt: -8,
    neck: [192, 120],
    shoulderL: [172, 134],
    shoulderR: [220, 134],
    elbowL: [122, 138],
    elbowR: [270, 137],
    wristL: [72, 142],
    wristR: [320, 140],
    hipL: [182, 214],
    hipR: [212, 214],
    kneeL: [122, 268],
    kneeR: [268, 296],
    ankleL: [116, 336],
    ankleR: [318, 336],
    matWidth: 250,
  },

  /* Vrksasana — standing on the right leg; the left foot rests at the inner right
     thigh, which is why ankleL sits ABOVE kneeR rather than on the floor. Arms
     overhead, palms meeting just off centre. */
  tree: {
    head: [200, 98],
    headTilt: 0,
    neck: [200, 126],
    shoulderL: [178, 138],
    shoulderR: [222, 138],
    elbowL: [164, 92],
    elbowR: [236, 92],
    wristL: [193, 48],
    wristR: [207, 48],
    hipL: [186, 212],
    hipR: [214, 212],
    kneeL: [140, 252],
    kneeR: [215, 274],
    ankleL: [198, 266],
    ankleR: [214, 336],
    matWidth: 110,
  },

  /* Sukhasana — seated cross-legged, spine tall, hands resting on the knees. The hero
     pose: symmetrical, calm, and it reads at a glance even at small sizes. The knees sit
     WIDE and low while the ankles tuck to the centre, which is what makes crossed legs
     read as crossed rather than as a kneel. */
  lotus: {
    head: [200, 106],
    headTilt: 0,
    neck: [200, 136],
    shoulderL: [172, 150],
    shoulderR: [228, 150],
    elbowL: [156, 196],
    elbowR: [244, 196],
    wristL: [146, 246],
    wristR: [254, 246],
    hipL: [184, 242],
    hipR: [216, 242],
    kneeL: [142, 266],
    kneeR: [258, 266],
    ankleL: [194, 284],
    ankleR: [206, 284],
    matWidth: 148,
    matY: 296,
  },

  /* Balasana — the only horizontal pose. Hips sit back over the heels at the right,
     the spine slopes down to the left, and the arms reach forward along the floor.
     The head is low and near the ground, not stacked above the shoulders. */
  child: {
    head: [138, 310],
    headTilt: -78,
    neck: [168, 300],
    shoulderL: [178, 296],
    shoulderR: [176, 304],
    elbowL: [124, 310],
    elbowR: [122, 318],
    wristL: [68, 322],
    wristR: [66, 330],
    hipL: [286, 252],
    hipR: [290, 260],
    kneeL: [300, 318],
    kneeR: [304, 324],
    ankleL: [338, 336],
    ankleR: [342, 336],
    matWidth: 300,
  },
};

/* ── drawing helpers ───────────────────────────────────────────────────── */

const FLOOR = 340;

function seg(a: Point, b: Point): string {
  return `M ${a[0]} ${a[1]} L ${b[0]} ${b[1]}`;
}

/**
 * A limb, drawn as two tapered strokes rather than one.
 *
 * One uniform stroke from shoulder to wrist reads as a pipe. Splitting at the joint and
 * narrowing the far half is the entire difference between "tube" and "arm", and it costs
 * one extra path.
 */
function Limb({
  from,
  via,
  to,
  nearWidth,
  farWidth,
  color,
  opacity = 1,
}: {
  from: Point;
  via: Point;
  to: Point;
  nearWidth: number;
  farWidth: number;
  color: string;
  opacity?: number;
}) {
  return (
    <g opacity={opacity}>
      <path
        d={seg(from, via)}
        stroke={color}
        strokeWidth={nearWidth}
        strokeLinecap="round"
        fill="none"
      />
      <path
        d={seg(via, to)}
        stroke={color}
        strokeWidth={farWidth}
        strokeLinecap="round"
        fill="none"
      />
    </g>
  );
}

/**
 * The torso, as a filled shape that narrows at the waist.
 *
 * Built from the shoulder and hip joints so it follows the pose automatically — a
 * separate hand-drawn torso per pose would drift out of alignment the first time a
 * shoulder moved.
 */
function torsoPath(s: Skeleton): string {
  const [slx, sly] = s.shoulderL;
  const [srx, sry] = s.shoulderR;
  const [hlx, hly] = s.hipL;
  const [hrx, hry] = s.hipR;

  // Waist: the midpoint of each side, drawn 5 units inboard so the silhouette curves.
  const centreX = (slx + srx + hlx + hrx) / 4;
  const waistLx = (slx + hlx) / 2 + (centreX - (slx + hlx) / 2) * 0.22;
  const waistLy = (sly + hly) / 2;
  const waistRx = (srx + hrx) / 2 + (centreX - (srx + hrx) / 2) * 0.22;
  const waistRy = (sry + hry) / 2;

  return [
    `M ${slx} ${sly}`,
    `Q ${waistLx} ${waistLy} ${hlx} ${hly}`,
    `L ${hrx} ${hry}`,
    `Q ${waistRx} ${waistRy} ${srx} ${sry}`,
    `Q ${(slx + srx) / 2} ${(sly + sry) / 2 - 9} ${slx} ${sly}`,
    "Z",
  ].join(" ");
}

/* ── the figure ────────────────────────────────────────────────────────── */

export interface PoseIllustrationProps {
  pose: PoseKey;
  className?: string;
}

/**
 * One drawn figure holding one pose.
 *
 * Decorative: `aria-hidden`. Every pose's name, Sanskrit name and description is already
 * rendered as text by the caller, so a screen reader that skipped this loses nothing —
 * the same contract `yoga-fallback.tsx` keeps for the 3D path.
 */
export function PoseIllustration({ pose, className }: PoseIllustrationProps) {
  const s = SKELETONS[pose];

  const SKIN = "var(--champagne)";
  const SKIN_BACK = "var(--sand)";
  const CLOTH = "var(--emerald)";
  const CLOTH_BACK = "var(--forest)";
  const HAIR = "var(--forest)";

  return (
    <svg
      viewBox="0 0 400 400"
      className={cn("h-full w-full", className)}
      aria-hidden
      role="presentation"
    >
      <defs>
        <radialGradient id="pose-aura" cx="50%" cy="45%" r="52%">
          <stop offset="0%" stopColor="var(--jade)" stopOpacity="0.28" />
          <stop offset="60%" stopColor="var(--emerald)" stopOpacity="0.10" />
          <stop offset="100%" stopColor="var(--emerald)" stopOpacity="0" />
        </radialGradient>

        <linearGradient id="pose-cloth" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--jade)" />
          <stop offset="100%" stopColor="var(--emerald)" />
        </linearGradient>

        <linearGradient id="pose-mat" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--saffron)" stopOpacity="0.10" />
          <stop offset="50%" stopColor="var(--saffron)" stopOpacity="0.34" />
          <stop offset="100%" stopColor="var(--saffron)" stopOpacity="0.10" />
        </linearGradient>
      </defs>

      {/* Aura. Sits behind everything and never receives pointer events. */}
      <circle cx="200" cy="185" r="165" fill="url(#pose-aura)" />
      <circle
        cx="200"
        cy="185"
        r="146"
        fill="none"
        stroke="var(--jade)"
        strokeOpacity="0.30"
        strokeWidth="1"
        strokeDasharray="3 7"
      />

      {/* The mat, which also reads as the floor line the figure is standing on. */}
      <ellipse
        cx="200"
        cy={s.matY ?? FLOOR + 6}
        rx={s.matWidth}
        ry="11"
        fill="url(#pose-mat)"
      />

      {/* ── BACK limbs (left side), darker and behind the torso ── */}
      <Limb
        from={s.shoulderL}
        via={s.elbowL}
        to={s.wristL}
        nearWidth={14}
        farWidth={11}
        color={SKIN_BACK}
        opacity={0.85}
      />
      <Limb
        from={s.hipL}
        via={s.kneeL}
        to={s.ankleL}
        nearWidth={21}
        farWidth={16}
        color={CLOTH_BACK}
        opacity={0.85}
      />

      {/* ── TORSO ── */}
      <path d={torsoPath(s)} fill="url(#pose-cloth)" />

      {/* Neck, tucked under the head and over the torso. */}
      <path
        d={seg(s.neck, [
          (s.shoulderL[0] + s.shoulderR[0]) / 2,
          (s.shoulderL[1] + s.shoulderR[1]) / 2,
        ])}
        stroke={SKIN}
        strokeWidth="13"
        strokeLinecap="round"
      />

      {/* ── FRONT limbs (right side) ── */}
      <Limb
        from={s.hipR}
        via={s.kneeR}
        to={s.ankleR}
        nearWidth={22}
        farWidth={17}
        color={CLOTH}
      />
      <Limb
        from={s.shoulderR}
        via={s.elbowR}
        to={s.wristR}
        nearWidth={15}
        farWidth={12}
        color={SKIN}
      />

      {/* Hands and feet: small discs so limbs terminate in something, not in a stump. */}
      <circle cx={s.wristL[0]} cy={s.wristL[1]} r="7" fill={SKIN_BACK} opacity="0.85" />
      <circle cx={s.wristR[0]} cy={s.wristR[1]} r="7.5" fill={SKIN} />
      <circle cx={s.ankleL[0]} cy={s.ankleL[1]} r="8.5" fill={SKIN_BACK} opacity="0.85" />
      <circle cx={s.ankleR[0]} cy={s.ankleR[1]} r="9" fill={SKIN} />

      {/* ── HEAD ── */}
      <g transform={`rotate(${s.headTilt} ${s.head[0]} ${s.head[1]})`}>
        {/* Hair mass, drawn first so the face sits in front of it. */}
        <ellipse
          cx={s.head[0]}
          cy={s.head[1] - 4}
          rx="24"
          ry="26"
          fill={HAIR}
        />
        <ellipse cx={s.head[0]} cy={s.head[1]} rx="19.5" ry="22" fill={SKIN} />
        {/* A long tail of hair — the one detail that stops the head reading as a ball. */}
        <path
          d={`M ${s.head[0] - 20} ${s.head[1] - 6}
              q -10 26 2 46
              q 8 -20 6 -44 Z`}
          fill={HAIR}
          opacity="0.9"
        />
        {/* Eyes closed: two soft arcs. Calm, and it avoids drawing a gaze that would
            fight the pose's own direction. */}
        <path
          d={`M ${s.head[0] - 9} ${s.head[1] + 1} q 4 3 8 0`}
          stroke="var(--forest)"
          strokeWidth="1.6"
          strokeLinecap="round"
          fill="none"
          opacity="0.75"
        />
        <path
          d={`M ${s.head[0] + 2} ${s.head[1] + 1} q 4 3 8 0`}
          stroke="var(--forest)"
          strokeWidth="1.6"
          strokeLinecap="round"
          fill="none"
          opacity="0.75"
        />
      </g>
    </svg>
  );
}
