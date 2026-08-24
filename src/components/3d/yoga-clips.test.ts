import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { auditClips, CONTRACT_CLIPS, DEFAULT_CLIP, resolveClip } from "./yoga-clips";

/**
 * The clip contract, and the rule that a missing clip is never fatal.
 *
 * Two things are being protected. The first is that the names in code, the names in
 * `docs/3D-ASSET-CONTRACT.md`, and the names an artist is briefed on are the same names —
 * they are separately authored and will drift the moment nothing checks. The second is
 * that every path through `resolveClip` ends somewhere renderable, because the alternative
 * is a customer opening the yoga experience and getting a blank rectangle where their
 * consultant's guidance should be.
 */

const contractPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "docs",
  "3D-ASSET-CONTRACT.md",
);

describe("the clip names match the asset contract", () => {
  it("names exactly the clips the contract asks an artist to deliver", () => {
    /*
     * The document is the thing handed to a third party and paid for, so it is the
     * authority; this test makes the code follow it rather than the other way round. If
     * an artist delivers to §5 and the code expects something else, the failure appears at
     * integration — after the money is spent.
     */
    const contract = readFileSync(contractPath, "utf8");

    // §5 lists each clip in a table row as `| `clip-name` | ... |`.
    const listed = [...contract.matchAll(/^\|\s*`([a-z0-9-]+)`\s*\|/gm)].map((m) => m[1]);

    expect(listed.length).toBeGreaterThan(0);
    expect([...listed].sort()).toEqual([...CONTRACT_CLIPS].sort());
  });

  it("requires the fallback clip it depends on", () => {
    // `resolveClip` falls back to this by name. If the contract stopped requiring it, the
    // fallback would quietly become "whatever clip happens to be first".
    expect(CONTRACT_CLIPS).toContain(DEFAULT_CLIP);
  });
});

describe("resolveClip", () => {
  const full = [...CONTRACT_CLIPS];

  it("plays what was asked for when it exists", () => {
    expect(resolveClip("warrior-1-left", full)).toBe("warrior-1-left");
  });

  it("falls back to the idle clip when the requested one is absent", () => {
    // The everyday case: a pose references a clip this organisation's asset never had.
    expect(resolveClip("handstand", full)).toBe(DEFAULT_CLIP);
  });

  it("falls back to the idle clip when nothing was requested", () => {
    expect(resolveClip(null, full)).toBe(DEFAULT_CLIP);
    expect(resolveClip(undefined, full)).toBe(DEFAULT_CLIP);
    expect(resolveClip("", full)).toBe(DEFAULT_CLIP);
  });

  it("uses whatever exists when even the idle clip is missing", () => {
    // A partial delivery — nine clips of eleven — must still animate rather than freeze.
    expect(resolveClip("mountain", ["child-pose", "tree-left"])).toBe("child-pose");
  });

  it("returns null only when the asset contains no clips at all", () => {
    // The one case with no animation. The character still renders, in its bind pose, and
    // the written instructions are on screen beneath it either way.
    expect(resolveClip("mountain", [])).toBeNull();
    expect(resolveClip(null, [])).toBeNull();
  });

  it("never returns a name the asset does not contain", () => {
    // The property that matters for not crashing: whatever comes back can be looked up.
    const cases: [string | null, string[]][] = [
      ["mountain", full],
      ["nope", full],
      [null, full],
      ["nope", ["only-this"]],
      [null, ["only-this"]],
      ["nope", []],
    ];

    for (const [requested, available] of cases) {
      const result = resolveClip(requested, available);
      if (result !== null) expect(available).toContain(result);
    }
  });

  it("is not case-insensitive, and that is deliberate", () => {
    // glTF clip names are matched exactly by three. Being lenient here would resolve a
    // name that then fails to look up in the mixer — a failure moved, not fixed.
    expect(resolveClip("Mountain", full)).toBe(DEFAULT_CLIP);
  });
});

describe("auditClips", () => {
  it("reports a complete delivery", () => {
    expect(auditClips([...CONTRACT_CLIPS])).toEqual({
      missing: [],
      extra: [],
      complete: true,
    });
  });

  it("names exactly which contracted clips are absent", () => {
    // This is what makes §7's acceptance check a check rather than an eyeball.
    const delivered = CONTRACT_CLIPS.filter(
      (c) => c !== "child-pose" && c !== "transition-out",
    );
    const audit = auditClips(delivered);

    expect(audit.missing).toEqual(["child-pose", "transition-out"]);
    expect(audit.complete).toBe(false);
  });

  it("reports extra clips without treating them as a failure", () => {
    // An artist adding `savasana` is a bonus, not a defect.
    const audit = auditClips([...CONTRACT_CLIPS, "savasana"]);

    expect(audit.extra).toEqual(["savasana"]);
    expect(audit.complete).toBe(true);
  });
});
