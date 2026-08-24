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
| `warrior-1-left` | loop | 4–6 s | |
| `warrior-1-right` | loop | 4–6 s | |
| `seated-meditation` | loop | 6–8 s | Sukhasana |
| `child-pose` | loop | 4–6 s | Balasana |
| `transition-in` | once | ≤ 1.5 s | Neutral → the pose |
| `transition-out` | once | ≤ 1.5 s | The pose → neutral |

**Every looping clip must loop seamlessly** — first and last frame identical in pose and in
velocity. A visible pop at the loop point is the single most noticeable defect in a
practice animation, because the viewer is watching it for minutes.

Left/right variants are separate clips rather than a mirrored playback flag: mirroring at
runtime is a common source of inverted normals and reversed root motion.

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

## 8. What still has to be built on our side

**The asset alone does not complete 15C.** As of today the loading path does not exist —
`resolveModel()` computes a reference that the scene discards. The following is engineering
work, independent of the asset, and can start before it arrives:

1. glTF loading through the existing lazy boundary, with self-hosted Draco and KTX2
   decoders placed in `public/`.
2. `AnimationMixer` driving clip playback from `animation_reference`, with cross-fades.
3. The scroll journey driving clip selection per section — currently it pins sections and
   shows text; it does not control animation.
4. Loading and decode-failure states, joining the four degradation paths already covered by
   `yoga-viewer.test.tsx`.
5. Verification that the ADR-014 promise still holds: `three` stays out of `/today`'s
   bundle, and the CSP exception stays scoped to `/experience/*`.

Estimated: this is a contained addition, not a rewrite, precisely because the data seam and
the degradation contract already exist and are tested.

## 9. If commissioning is not an option

A licensed rigged character plus a purchased clip library will satisfy §2–§4 if chosen
against this document rather than on appearance. The two things most often wrong with stock
assets are **licence terms that forbid SaaS redistribution** and **clips that do not loop
seamlessly**. Check those two first; everything else is fixable in a DCC tool.

A generated character is acceptable **only** if it arrives with a real skeleton, real skin
weights, and real clips meeting §5. A generated mesh with no rig is not a shortcut to 15C —
it is the same placeholder problem with better lighting.
