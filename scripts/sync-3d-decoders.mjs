/**
 * Copy the Draco and KTX2 decoders out of `three` and into `public/decoders/`.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY COPY RATHER THAN COMMIT, AND WHY SELF-HOST RATHER THAN USE A CDN
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * SELF-HOSTED, because the Content-Security-Policy allows `'self'` and ImageKit and
 * nothing else. Pointing `DRACOLoader` at Google's CDN — which every tutorial does — would
 * mean either a blocked request or a widened policy, and widening a CSP so a decoder can
 * load is how `script-src` quietly becomes meaningless. It also makes the yoga experience
 * depend on a third party's uptime for no benefit.
 *
 * COPIED AT BUILD TIME rather than committed, because these files must match the version
 * of `three` that consumes them. A committed copy is a copy that silently goes stale on
 * the next `npm update`, and a decoder mismatch does not fail loudly — it fails as a
 * corrupt mesh or a hang inside a worker.
 *
 * Runs from `prebuild` and `predev`, so any path that starts the application produces
 * them. `public/decoders/` is gitignored.
 *
 * LICENCES: Draco is Apache-2.0 (Google), Basis Universal is Apache-2.0 (Binomial LLC).
 * Both already ship inside the `three` dependency, so nothing new enters the tree.
 */

import { copyFileSync, mkdirSync, existsSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "node_modules", "three", "examples", "jsm", "libs");
const to = join(root, "public", "decoders");

/**
 * What gets copied, and what deliberately does not.
 *
 * `draco_decoder.js` — the 504 KB asm.js fallback for browsers without WebAssembly — is
 * NOT copied. Anything that can run WebGL2 can run WASM, the route's CSP already grants
 * `'wasm-unsafe-eval'`, and a browser that somehow had one without the other lands in the
 * decode-failure state, which shows the pose's full written instructions. Half a megabyte
 * to serve a set of browsers that is very close to empty is the wrong trade.
 */
const FILES = [
  ["draco/gltf/draco_decoder.wasm", "draco/draco_decoder.wasm"],
  ["draco/gltf/draco_wasm_wrapper.js", "draco/draco_wasm_wrapper.js"],
  ["basis/basis_transcoder.wasm", "basis/basis_transcoder.wasm"],
  ["basis/basis_transcoder.js", "basis/basis_transcoder.js"],
];

let copied = 0;
let bytes = 0;
const missing = [];

for (const [source, target] of FILES) {
  const src = join(from, source);
  const dest = join(to, target);

  if (!existsSync(src)) {
    missing.push(source);
    continue;
  }

  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
  copied += 1;
  bytes += statSync(dest).size;
}

if (missing.length > 0) {
  // Fail loudly. A silent partial copy produces a build whose 3D route dies inside a
  // worker at runtime, which is a far worse place to discover it than here.
  console.error(
    `sync-3d-decoders: ${missing.length} decoder file(s) missing from three:\n` +
      missing.map((m) => `  ${m}`).join("\n") +
      "\nThe three package layout may have changed. Do not ship without these.",
  );
  process.exit(1);
}

// A note beside the binaries, for whoever finds them and wonders why they are not in git.
writeFileSync(
  join(to, "README.md"),
  `# Decoders — generated, do not commit

Copied from \`node_modules/three\` by \`scripts/sync-3d-decoders.mjs\`, which runs from
\`prebuild\` and \`predev\`. They live here because the Content-Security-Policy permits
scripts from \`'self'\` only, so a CDN-hosted decoder would be blocked — and widening the
policy for one is not a trade worth making.

They are NOT committed: these must match the installed version of \`three\`, and a
committed copy goes stale on the next update without failing loudly.

Draco — Apache-2.0, Google. Basis Universal — Apache-2.0, Binomial LLC.
`,
  "utf8",
);

console.log(
  `sync-3d-decoders: ${copied} files, ${(bytes / 1024).toFixed(0)} KB → public/decoders/`,
);
