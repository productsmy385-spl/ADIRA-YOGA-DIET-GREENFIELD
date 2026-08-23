import { timingSafeEqual } from "node:crypto";

import { env } from "@/lib/env";

/**
 * Authorise a Railway Cron request.
 *
 * Cron routes have no session — the caller is a scheduler, not a person — so this bearer
 * token is the only thing between the open internet and a job drain. `CRON_SECRET` is a
 * production credential, and `docs/RAILWAY.md` says so.
 *
 * Compared in constant time. A `===` here leaks the token through response timing, one
 * byte at a time, to anyone willing to make a few thousand requests — and unlike a
 * session token, this one never rotates on its own.
 */
export function isAuthorisedCronRequest(request: Request): boolean {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return false;

  const presented = Buffer.from(header.slice("Bearer ".length), "utf8");
  const expected = Buffer.from(env.CRON_SECRET, "utf8");

  // Length is compared first because timingSafeEqual throws on a mismatch. The LENGTH of
  // the secret is not itself sensitive; only its contents are.
  if (presented.length !== expected.length) return false;
  return timingSafeEqual(presented, expected);
}

/** The standard refusal. Deliberately says nothing about why. */
export function cronUnauthorised(): Response {
  return Response.json({ error: "Unauthorized." }, { status: 401 });
}
