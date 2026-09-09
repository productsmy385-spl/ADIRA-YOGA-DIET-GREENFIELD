# `public/3d/yoga/` — where the yoga character GLB goes

**Status: EMPTY. No production 3D asset exists in this repository.**

Nothing here is a placeholder file, a stub, or a sample. If you are looking for a GLB,
there isn't one — see "What is still needed" below.

The full specification is [`docs/3D-ASSET-CONTRACT.md`](../../../docs/3D-ASSET-CONTRACT.md).
This file covers only where the bytes go and how they get wired up.

---

## How an asset gets used — no code change required

The loading path is already built and is **data-driven**, per ADR-014:

```
yoga_exercises.model_reference      →  the GLB URL to load
yoga_exercises.animation_reference  →  the clip name to play inside it
```

So integrating a delivered character is a **database update**, not a deployment of new
components. Drop the file here and point the column at it:

```sql
UPDATE yoga_exercises
   SET model_reference     = '/3d/yoga/adira-character.glb',
       animation_reference = 'mountain'
 WHERE name = 'Mountain pose';
```

`src/components/3d/yoga-model.tsx` hardcodes no path, no clip name and no bone name, and
`src/components/3d/auto-frame.tsx` derives the camera from the model's own bounding box —
so a taller or differently-proportioned character frames itself correctly with no tuning.

## One file, not four

**Prefer a single GLB containing every clip**, named `adira-character.glb`.

This is §1 of the asset contract and it is a performance decision, not a filing preference:
the character downloads once, and every subsequent pose is an in-memory clip switch rather
than another network request. Four per-pose files mean four downloads of four copies of the
same mesh, skeleton and textures — roughly four times the bytes for the same experience,
on the mid-range phone this product targets.

Per-pose files (`mountain-pose.glb`, `warrior-2.glb`, …) will *work* — `model_reference` is
a URL, so the loader does not care — but you pay that cost on every pose change. Only take
that route if the artist genuinely cannot deliver one file.

## Budgets, restated so they are not negotiated away

From contract §3. A delivery failing any line is a rejection.

| | Ceiling |
|---|---|
| Triangles | ≤ 25,000 |
| Bones | ≤ 75 |
| Skin influences | ≤ 4 per vertex |
| Textures | ≤ 3, base colour 1024² (2048² only if justified) |
| **Total GLB** | **≤ 3 MB** |
| Draw calls | ≤ 3 |

Format: `.glb`, glTF 2.0, Draco geometry, KTX2/Basis textures, +Y up, facing +Z,
1 unit = 1 metre, ~1.7 m tall, origin between the feet at floor level.

Draco and KTX2 decoders are **self-hosted** from `public/decoders/` (synced out of `three`
at `prebuild`). They are never loaded from a CDN — the CSP would block it, and widening
`script-src` for a decoder is how a policy stops meaning anything.

## Required clips

The eleven names are defined once, in `src/components/3d/yoga-clips.ts`
(`CONTRACT_CLIPS`), and mirrored in contract §5. Use them **verbatim**:

```
idle-breathing   mountain          forward-fold
tree-left        tree-right        warrior-2-left
warrior-2-right  seated-meditation child-pose
transition-in    transition-out
```

**`warrior-2-*` is Warrior II (Virabhadrasana II), not Warrior I.** Arms level and extended
front-to-back over a wide stance, front knee stacked over the ankle, gaze over the front
hand. Warrior I — arms overhead, hips squared forward — is a different asana and is **not**
required. Delivering it instead is a rejection under §7. See contract §11.

Every looping clip must loop seamlessly — identical first and last frame in both pose and
velocity. **No root motion.** Run `auditClips()` from `yoga-clips.ts` against a delivery to
check this mechanically rather than by eye.

> ### ⚠️ One open conflict — resolve before commissioning
>
> **The requested filenames imply per-pose files**, which §1 argues against. See
> "One file, not four" above.
>
> *(The Warrior I / Warrior II mismatch was resolved on 2026-09-09 — Warrior II is
> canonical, and the clip names above already reflect it. Contract §11 records why.)*

## Licensing — check before you download anything

Public downloadability is **not** permission. The contract (§6) requires, in writing:

- commercial use permitted, for SaaS serving multiple paying organisations
- irrevocable and perpetual, no ongoing royalty
- redistribution inside a web application permitted (the GLB is served to browsers)
- no attribution requirement the product cannot honour
- confirmation the author owns every component — base mesh, textures, and any purchased
  or motion-captured clips

Keep the licence document in the repository beside the contract. An asset whose provenance
cannot be evidenced has to be replaced later at full cost.

### Rejected: Sketchfab `bc5d931c85bb4066b98a3a968c7118c1` ("A. Yoga Pose")

Assessed 2026-09-09 via the public Sketchfab metadata API. **Unusable on four independent
grounds** — do not re-propose it:

| Check | Value | Verdict |
|---|---|---|
| `isDownloadable` | `false` | No lawful way to obtain the file |
| `license` | `{}` (empty) | Default copyright — no commercial or redistribution grant |
| `animationCount` | `0` | Contract §5 needs 11 clips |
| `faceCount` | 277,353 | **11× over** the 25,000 ceiling |

The model page also carries a **NoAI** restriction.

## What is still needed

A rigged humanoid meeting §2–§5 with a §6-compliant licence. The contract names
**Mixamo-compatible bone naming** as the pragmatic default (§4), which makes Mixamo itself
the first place worth looking: it is free with an Adobe account, ships rigged humanoids,
and its naming convention is already what the contract specifies.

Whatever the source, check the licence **before** downloading, and record it here.
