import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Every server action must be reachable from the interface.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THE BUG CLASS THIS EXISTS FOR
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * A completion pass found six server actions that were written, authorised, audited and
 * covered by unit tests — and called by nothing. Among them:
 *
 *   `takeIntoCaseloadAction`     the ONLY way to create a `consultant_assignments` row.
 *                                Without it an admin could add a member, then never open
 *                                them (404) and never prescribe. The whole product
 *                                deadlocked behind a missing button.
 *   `publishProgrammeAction`     the DRAFT → PUBLISHED transition. Every programme was
 *                                stuck in DRAFT permanently.
 *   `createOrganizationAction`   tenant provisioning. Its form component existed too, and
 *                                the PAGE did not import the form.
 *
 * None of this failed. Typecheck passed, lint passed, every unit test passed, the build
 * succeeded, and the deployed application simply had no route to the feature. That is the
 * signature of the class: an action's own test proves it works, and proves nothing about
 * whether anybody can reach it.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHAT THIS CHECKS, AND WHAT IT DELIBERATELY DOES NOT
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * It checks REACHABILITY BY IMPORT: every `export async function …Action` under
 * `src/app` is named by at least one non-test file that is not the module declaring it.
 *
 * It does NOT check that the importer is itself rendered, that the control is visible, or
 * that a human can find it. A component can still be orphaned one level up — which is
 * exactly what happened to `platform-forms.tsx`. So this is a floor, not a ceiling: it
 * catches the cheap half of the problem cheaply, and the expensive half stays the job of
 * the end-to-end suites.
 *
 * A grep-based test is unusual and worth the trade. The alternative is a build-time graph,
 * which is far more machinery for a check that has to be fast enough to run every time.
 */

const APP_DIR = resolve(__dirname, "..", "src", "app");
const SRC_DIR = resolve(__dirname, "..", "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

const isTest = (file: string) => /\.test\.tsx?$/.test(file);

const ALL_SOURCE = walk(SRC_DIR).filter((f) => !isTest(f));

/** Every `export async function fooAction(` in a file, by name. */
function exportedActions(file: string): string[] {
  const source = readFileSync(file, "utf8");
  return [...source.matchAll(/export\s+async\s+function\s+(\w*Action)\s*\(/g)].map(
    (m) => m[1],
  );
}

interface Orphan {
  action: string;
  file: string;
}

describe("server actions are reachable from the interface", () => {
  it("has no action that nothing imports", () => {
    const actionFiles = walk(APP_DIR).filter(
      (f) => f.endsWith("actions.ts") && !isTest(f),
    );

    // Sanity: if the glob stops matching, an empty pass would be a silently useless test.
    expect(actionFiles.length).toBeGreaterThan(0);

    const orphans: Orphan[] = [];

    for (const file of actionFiles) {
      for (const action of exportedActions(file)) {
        const referenced = ALL_SOURCE.some((candidate) => {
          if (candidate === file) return false;
          // Word boundary, so `createAdminAction` is not matched by a search for
          // `createAdmin`.
          return new RegExp(`\\b${action}\\b`).test(readFileSync(candidate, "utf8"));
        });

        if (!referenced) {
          orphans.push({ action, file: relative(SRC_DIR, file).replace(/\\/g, "/") });
        }
      }
    }

    expect(
      orphans.map((o) => `${o.action} (${o.file}) is exported but nothing imports it`),
    ).toEqual([]);
  });

  /**
   * The narrower guard, named explicitly.
   *
   * These four are the ones whose absence broke a whole workflow rather than one control,
   * so they are asserted by name as well as by the sweep above. A future refactor that
   * renames one will fail here loudly instead of silently reducing the sweep's coverage.
   */
  it("keeps the workflow-critical actions wired", () => {
    const critical = [
      "takeIntoCaseloadAction",
      "publishProgrammeAction",
      "createOrganizationAction",
      "createAdminAction",
    ];

    const rendered = ALL_SOURCE.filter((f) => f.endsWith(".tsx")).map((f) =>
      readFileSync(f, "utf8"),
    );

    for (const action of critical) {
      const found = rendered.some((source) => new RegExp(`\\b${action}\\b`).test(source));
      expect(found, `${action} must be referenced by a component`).toBe(true);
    }
  });
});
