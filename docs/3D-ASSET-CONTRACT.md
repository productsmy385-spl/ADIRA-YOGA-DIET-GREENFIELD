# 3D asset contract — the Adira yoga character (15C)

**Hand this document to whoever produces the character.** It is written so that a delivery
either meets it or does not, without argument. Every number has a reason attached, because
a budget without a reason gets negotiated away.

Status: **no production asset exists.** The application renders a deliberately abstract
placeholder and says so on screen.

---

## 1. What the application already does, and where the asset plugs in

```
yoga_exercises.model_reference      →  resolveModel(pose)  →  the GLB to load
yoga_exercises.animation_reference  →  the clip name to play inside that GLB
```

Both columns exist and are populated per pose. **One GLB containing every clip** is
strongly preferred over one file per pose: the character is downloaded once and every
subsequent pose is a clip switch rather than a network request.

## 2. Format and packaging

| | Requirement |
|---|---|
| Container | `.glb` (binary glTF 2.0). Not `.gltf` + loose files, not `.fbx` |
| Geometry compression | Draco |
| Texture compression | KTX2 / Basis Universal |
| Meshes | **One** skinned mesh for the body. Additional meshes only where a material genuinely differs (e.g. hair) |
| Materials | PBR metallic-roughness. Occlusion/Roughness/Metallic packed into one ORM texture |
| Up axis | +Y. Facing +Z |
| Scale | **1 unit = 1 metre.** Character ~1.7 m tall |
| Origin | Between the feet, at floor level, at world origin |
| Node transforms | Applied/frozen — no non-uniform scale left on the root |

Draco and KTX2 are why the Content-Security-Policy carries `'wasm-unsafe-eval'` and
`worker-src blob:` on `/experience/*` and nowhere else. That exception already exists and
is deliberately scoped; the decoders will be **self-hosted**, never loaded from a CDN.

## 3. Budgets

The target device is a mid-range Android on a mobile connection, not a laptop. These are
ceilings, not aspirations.

| | Ceiling | Why |
|---|---|---|
| Triangles | **≤ 25,000** | A single character at this size is GPU-cheap; the cost that bites is vertex skinning per frame |
| Bones | **≤ 75** | Skinning cost and uniform limits on older GL ES drivers |
| Skin influences | **≤ 4 per vertex** | Above this many renderers silently drop the extra weights, deforming differently in production than in the DCC tool |
| Base colour texture | 1024², 2048² only if justified | |
| ORM texture | 1024² | |
| Texture count | **≤ 3** total | Each is a separate decode and upload |
| **Total GLB** | **≤ 3 MB** | It downloads on a route people arrive at deliberately, but it must not feel broken on 4G |
| Draw calls | ≤ 3 | |

Deliver an uncompressed source (`.blend` / `.fbx`) alongside, so the asset can be
re-exported when budgets or tooling change. **Do not** deliver only the GLB.

## 4. Rig

A **standard humanoid skeleton**. Mixamo-compatible bone naming is the pragmatic default —
it is the widest-supported convention, it works with purchased clip libraries, and it means
a future retarget is routine rather than a rebuild.

- Clean deformation at shoulders, hips, spine and knees, checked in the **extreme** poses
  below, not just in T-pose. Yoga is deep flexion; a rig that looks fine standing will tear
  at the hip in a seated forward fold.
- No IK constraints, drivers, or custom bone shapes in the exported file — bake to FK.
- No facial rig. No cloth simulation. Both are cost with little payoff at this scale and
  neither survives the poly budget.

## 5. Animation clips

Clip names are the contract with the database: whatever is delivered here goes verbatim
into `yoga_exercises.animation_reference`. Use **exactly** these names, lowercase,
hyphenated.

| Clip | Type | Length | Notes |
|---|---|---|---|
| `idle-breathing` | loop | 4–6 s | The default. Must loop seamlessly |
| `mountain` | loop | 4–6 s | Tadasana, with breath movement |
| `forward-fold` | loop | 4–6 s | Uttanasana |
| `tree-left` | loop | 4–6 s | Vrksasana, left leg raised |
| `tree-right` | loop | 4–6 s | Mirror of the above |
| `warrior-2-left` | loop | 4–6 s | Virabhadrasana II, LEFT foot forward. Arms level and extended front-to-back, front knee stacked over the ankle, gaze over the front hand |
| `warrior-2-right` | loop | 4–6 s | Mirror of the above, right foot forward |
| `seated-meditation` | loop | 6–8 s | Sukhasana |
| `child-pose` | loop | 4–6 s | Balasana |
| `transition-in` | once | ≤ 1.5 s | Neutral → the pose |
| `transition-out` | once | ≤ 1.5 s | The pose → neutral |

**Every looping clip must loop seamlessly** — first and last frame identical in pose and in
velocity. A visible pop at the loop point is the single most noticeable defect in a
practice animation, because the viewer is watching it for minutes.

Left/right variants are separate clips rather than a mirrored playback flag: mirroring at
runtime is a common source of inverted normals and reversed root motion.

**Warrior II, not Warrior I** — see §11. They are different asanas, not two names for one
pose, and an artist briefed on the wrong one delivers an unusable clip. Warrior II has the
arms extended level front-to-back over a wide stance with the torso upright and open to
the side; Warrior I has the arms overhead with the hips squared forward. The product uses
Warrior II. If Warrior I is ever wanted for the exercise library, it is added as
`warrior-1-left` / `warrior-1-right` alongside these — never by redefining them.

`warrior-2-left` is the variant the landing experience plays when it shows a single
warrior. Left-foot-forward is the convention throughout this document, matching
`tree-left`.

**No root motion.** The character stays at the origin; the camera moves, not the figure.

## 6. Licence

Non-negotiable, and it is the requirement most often skipped:

- **Commercial use permitted**, for a SaaS product serving multiple paying organisations.
- **Irrevocable and perpetual**, without ongoing royalty.
- Redistribution as part of a web application is permitted (the GLB is served to browsers).
- No attribution requirement in the UI, or an attribution the product can actually honour.
- Written confirmation the artist owns or has licensed every component — including any
  purchased base mesh, texture pack, or motion-capture clip used to produce it.

Keep the licence document in the repository next to this file. An asset whose provenance
cannot be evidenced is one that has to be replaced later, at full cost.

## 7. Acceptance checklist

On delivery, the asset is checked against this. A failure on any line is a rejection.

- [ ] Loads as glTF 2.0 with Draco and KTX2 decoding
- [ ] ≤ 25,000 triangles, ≤ 75 bones, ≤ 4 influences per vertex
- [ ] Total file ≤ 3 MB
- [ ] Scale, up axis, facing and origin as specified
- [ ] Every clip in §5 present, named exactly, correct type
- [ ] Every looping clip loops with no visible pop
- [ ] No root motion
- [ ] No deformation artefacts in seated forward fold, tree, and child pose
- [ ] Renders correctly on a mid-range Android, sustained, without thermal throttling
- [ ] Licence documentation supplied and permits the above
- [ ] Uncompressed source files supplied

## 8. Our side — built, and what is left

**The loading path now exists.** As of 2026-08-24 the following is implemented and passing
`npm test`, `npm run lint`, `tsc --noEmit` and `npm run build`:

| | |
|---|---|
| glTF loading | `useGLTF` inside the existing `next/dynamic` boundary |
| Draco | self-hosted, `public/decoders/draco/` |
| KTX2 / Basis | self-hosted, `public/decoders/basis/`, with `detectSupport` from the live renderer |
| Decoder provenance | copied from `three` by `scripts/sync-3d-decoders.mjs` at `prebuild`/`predev`, gitignored so they cannot drift from the installed version |
| Animation | our own `AnimationMixer`, per-instance |
| Instancing | `SkeletonUtils.clone` per viewer — see below |
| Clip resolution | `animation_reference` → `yoga-clips.ts`, 12 tests |
| Transitions | `fadeIn`/`fadeOut` cross-fade, 0.4 s |
| Pause | `mixer.update(0)` — holds the pose rather than dropping to a T-pose |
| Decode failure | `ModelBoundary` in `yoga-scene.tsx` → the pose's written instructions |
| Loading | Suspense, showing the placeholder figure until the real model parses |
| Bundle guard | `three` still absent from `/today`, `/dashboard`, `/admin` — verified against the emitted production chunks |
| **Camera framing** | **computed from the model's own bounding box — `framing.ts` (pure, 38 tests) + `auto-frame.tsx`. Added 2026-09-09** |

**Framing is no longer hand-tuned.** `yoga-scene.tsx` previously carried
`position: [0, 1.1, 3.2], fov: 42` — three numbers correct for one figure at one aspect
ratio, with nothing saying so. `AutoFrame` now measures the loaded object and derives
distance, target, `near` and `far` from it, checking BOTH axes so a wide pose on a portrait
phone does not lose its hands. A taller character frames itself; a rotated phone reframes.
The arithmetic is asserted against every breakpoint in the brief (360–1920) for a standing,
a Warrior II and a Child's-pose bounding box.

One caveat worth knowing before a delivery is judged: `Box3.setFromObject` measures a
skinned mesh in its **bind pose**, not mid-animation. `DEFAULT_MARGIN` (1.22) absorbs the
difference. If a real character still crops on one clip, raise the margin for that pose —
do not re-measure per frame, which would traverse the skeleton every frame for a number
that changes slowly.

Two decisions worth knowing, because both are invisible until they break:

**Every viewer clones the character with `SkeletonUtils.clone`.** `useGLTF` caches by URL
and returns the *same* scene object to every caller. The journey renders seven sections; if
several use one character they would otherwise drive a single skeleton, and whichever
section animated last would win for all of them — poses changing as you scroll past
something unrelated. A plain `.clone()` does not fix it either: the copies stay bound to
the original skeleton and deform in lockstep.

**A missing clip is never fatal.** Requested → `idle-breathing` → whatever exists → no
animation. The last case still renders the character and the written instructions are on
screen regardless.

### What is NOT verified, and cannot be until an asset exists

The loader has **never loaded a real GLB.** No production or test asset is present, and
none was downloaded — an unverified third-party model is not something to add to this
repository on the way to testing a code path.

So these remain open, and they are integration questions rather than code questions:

1. That a real Draco-compressed, KTX2-textured GLB decodes end to end in a browser.
2. That the delivered clip names resolve against `animation_reference` in practice.
3. That the cross-fade looks right at the actual clip lengths.
4. That the budgets in §3 hold on a mid-range Android under sustained playback.

`auditClips()` exists to answer §7's clip checklist against a real delivery mechanically.

## 9. If commissioning is not an option

A licensed rigged character plus a purchased clip library will satisfy §2–§4 if chosen
against this document rather than on appearance. The two things most often wrong with stock
assets are **licence terms that forbid SaaS redistribution** and **clips that do not loop
seamlessly**. Check those two first; everything else is fixable in a DCC tool.

A generated character is acceptable **only** if it arrives with a real skeleton, real skin
weights, and real clips meeting §5. A generated mesh with no rig is not a shortcut to 15C —
it is the same placeholder problem with better lighting.

## 10. Assessed and rejected

Recording rejections stops the same asset being proposed twice.

### Sketchfab `bc5d931c85bb4066b98a3a968c7118c1` — "A. Yoga Pose"

Assessed **2026-09-09** through the public Sketchfab metadata API. Not downloaded, not
scraped, not referenced in the application. **Rejected on four independent grounds:**

| §7 line | Value | |
|---|---|---|
| Licence permits SaaS redistribution (§6) | `license: {}` — empty, default copyright | ❌ |
| Obtainable at all | `isDownloadable: false` | ❌ |
| Every clip in §5 present | `animationCount: 0` | ❌ |
| ≤ 25,000 triangles (§3) | `faceCount: 277,353` — 11× over | ❌ |

The model page additionally carries a **NoAI** restriction. Author: Another-me
(@fredlucazeau).

This is the ordinary outcome rather than bad luck: §9 warns that the two things most often
wrong with stock assets are licence terms forbidding SaaS redistribution and clips that do
not loop. This one fails the first before the second is even reachable.

## 11. Warrior II is the canonical warrior pose — RESOLVED

**Decided 2026-09-09 by the product owner. Warrior II. Do not substitute Warrior I.**

### What the mismatch was

§5 originally specified `warrior-1-left` / `warrior-1-right` — **Warrior I** — while the
landing experience has always been designed around **Warrior II** (Virabhadrasana II).
Those are different asanas:

| | Warrior I | Warrior II |
|---|---|---|
| Arms | Overhead, reaching up | Level, extended front-to-back |
| Hips | Squared to the front | Open to the side |
| Gaze | Up, past the hands | Forward, over the front hand |
| Bounding box | Tall and narrow | **Wide** — the widest pose in the set |

This was never cosmetic. Briefing an artist on Warrior I would have produced a clip that
does not match the pose the interface names, described or paid for — discovered at
integration, after the money is spent. The wide bounding box also matters to framing:
`framing.test.ts` sizes its Warrior case at 1.75 m wide against a 1.45 m height, and it is
the case that crops first on a portrait phone.

### The resolution

`warrior-1-left` / `warrior-1-right` are **replaced by** `warrior-2-left` /
`warrior-2-right`. The required clip count stays at **eleven** — this is a correction to
the specification, not additional animation work.

Replacing rather than adding was safe to do, and was verified before doing it:

- no `animation_reference` value is seeded in any migration, script or repository
- `warrior-1-*` appeared in exactly one place outside this document — a single example line
  in `yoga-clips.test.ts`
- no asset has been delivered, so no delivery is invalidated

Warrior I is therefore not currently required of any artist. If the exercise library later
wants it, it is **added** as `warrior-1-left` / `warrior-1-right` — never by redefining the
Warrior II names, which would silently repoint every row already referencing them.

### What stays true

No clip name has been invented. `warrior-2-left` / `warrior-2-right` are now part of what
§5 asks an artist to deliver, and `yoga-clips.test.ts` parses this document's §5 table and
fails the build if the names in code ever drift from the names in this table. A delivered
asset that omits them fails the §7 acceptance check, and `auditClips()` names them as
missing rather than letting them resolve quietly to `idle-breathing`.
