import { readFileSync, existsSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * THE BUNDLE GUARD FOR ADR-014.
 *
 * `three` + fiber + drei is 550–700 KB gzipped. ADR-014 permits it on `/experience/*` and
 * forbids it everywhere else, `/today` above all: the daily loop runs roughly 365 times a
 * year per customer, on the mid-range Android this product targets, and a heavier one is a
 * net loss however good it looks.
 *
 * That promise is kept by exactly one line — the `next/dynamic` call in `yoga-viewer.tsx`
 * — and breaking it fails SILENTLY. A stray `import YogaScene from "./yoga-scene"` in a
 * shared component makes every page that touches it 600 KB heavier while every test still
 * passes, every page still renders, and nothing anywhere says so. Bundle size is the one
 * regression with no runtime symptom, so it needs a test that reads the source rather than
 * the behaviour.
 *
 * The walk is over STATIC imports only, which is the point: a dynamic import is precisely
 * what we are allowing. Reaching `three` from `/today` through any chain of static imports
 * is the failure this catches.
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const srcDir = join(root, "src");

/** Packages whose presence in a bundle is the regression. */
const HEAVY_3D = ["three", "@react-three/fiber", "@react-three/drei"];

/** Modules that exist only to carry 3D, and so must also stay out. */
const THREE_D_DIR = join(srcDir, "components", "3d");

const EXTENSIONS = [".tsx", ".ts", "/index.tsx", "/index.ts"];

function resolveLocal(specifier: string, fromFile: string): string | null {
  let base: string;
  if (specifier.startsWith("@/")) {
    base = join(srcDir, specifier.slice(2));
  } else if (specifier.startsWith(".")) {
    base = resolve(dirname(fromFile), specifier);
  } else {
    return null; // A bare package specifier — not a file we walk into.
  }

  for (const ext of EXTENSIONS) {
    const candidate = base + ext;
    if (existsSync(candidate)) return candidate;
  }
  return existsSync(base) ? base : null;
}

/**
 * Static import specifiers only.
 *
 * `import(...)` is deliberately NOT matched. Matching it would make the test fail on the
 * very mechanism that makes the split work, and would report `yoga-viewer.tsx` — the file
 * doing the right thing — as the offender.
 */
function staticImports(source: string): string[] {
  const specifiers: string[] = [];
  const patterns = [
    /(?:^|\n)\s*import\s+[^;'"]*from\s*["']([^"']+)["']/g,
    /(?:^|\n)\s*import\s*["']([^"']+)["']/g,
    /(?:^|\n)\s*export\s+[^;'"]*from\s*["']([^"']+)["']/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) specifiers.push(match[1]);
  }
  return specifiers;
}

interface Reach {
  readonly heavy: string[];
  readonly visited: string[];
}

/** Every file statically reachable from `entry`, and every heavy import found on the way. */
function walk(entry: string): Reach {
  const seen = new Set<string>();
  const heavy: string[] = [];
  const queue = [entry];

  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);

    const source = readFileSync(file, "utf8");

    for (const specifier of staticImports(source)) {
      const bare = HEAVY_3D.find(
        (pkg) => specifier === pkg || specifier.startsWith(`${pkg}/`),
      );
      if (bare) {
        heavy.push(`${relative(root, file)} → ${specifier}`);
        continue;
      }

      const resolved = resolveLocal(specifier, file);
      if (!resolved) continue;

      if (resolved.startsWith(THREE_D_DIR)) {
        // Reaching INTO the 3D directory is only allowed for the type-only pose module
        // and the text fallback, neither of which imports `three`.
        const allowed = ["yoga-pose.ts", "yoga-fallback.tsx", "yoga-viewer.tsx"].some(
          (name) => resolved.endsWith(name),
        );
        if (!allowed) {
          heavy.push(`${relative(root, file)} → ${relative(root, resolved)}`);
          continue;
        }
      }

      queue.push(resolved);
    }
  }

  return { heavy, visited: [...seen] };
}

describe("ADR-014: 3D stays off the daily loop", () => {
  it("keeps three out of everything /today statically imports", () => {
    const entry = join(srcDir, "app", "today", "page.tsx");
    expect(existsSync(entry)).toBe(true);

    const { heavy, visited } = walk(entry);

    // A sanity check on the walker itself: a graph of one file would pass vacuously and
    // tell us nothing, which is the classic way a guard like this rots into decoration.
    expect(visited.length).toBeGreaterThan(3);
    expect(heavy).toEqual([]);
  });

  it("keeps three out of the customer dashboard too", () => {
    const entry = join(srcDir, "app", "dashboard", "page.tsx");
    if (!existsSync(entry)) return;
    expect(walk(entry).heavy).toEqual([]);
  });

  it("loads the scene only through next/dynamic", () => {
    const viewer = readFileSync(join(THREE_D_DIR, "yoga-viewer.tsx"), "utf8");

    // The boundary itself: a static import here would defeat the split at its source.
    expect(staticImports(viewer)).not.toContain("./yoga-scene");
    expect(viewer).toMatch(/dynamic\(\s*\(\)\s*=>\s*import\(["']\.\/yoga-scene["']\)/);
    expect(viewer).toMatch(/ssr:\s*false/);
  });

  it("reaches three only from the scene module", () => {
    const entry = join(srcDir, "app", "experience", "yoga", "page.tsx");
    expect(existsSync(entry)).toBe(true);

    // The experience route is ALLOWED 3D — but still only behind the dynamic boundary, so
    // its static graph must be clean for the same reason /today's is.
    expect(walk(entry).heavy).toEqual([]);
  });
});
