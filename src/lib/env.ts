import { parseServerEnv, type ServerEnv } from "./env-schema";

/**
 * Server environment, validated at module load.
 *
 * Why at load rather than at first use: a misconfigured deployment should fail while it
 * is still a deployment, with the offending key named, rather than succeeding and then
 * throwing on whichever request first touches the missing value. TempleOS validates
 * nothing at boot and its Knowledge Base records the resulting class of incident —
 * "a missing var fails at first use, not startup". This module is the fix.
 *
 * Importing this from a Client Component throws: the browser guard below fires, and none
 * of these keys carry the NEXT_PUBLIC_ prefix that would let Next.js inline them.
 * Public values live in `env.client.ts`.
 */

if (typeof window !== "undefined") {
  throw new Error(
    "src/lib/env.ts was imported from browser code. Server secrets must never reach the " +
      "client bundle — import from '@/lib/env.client' instead.",
  );
}

export const env: ServerEnv = parseServerEnv(process.env);

export type { ServerEnv };
