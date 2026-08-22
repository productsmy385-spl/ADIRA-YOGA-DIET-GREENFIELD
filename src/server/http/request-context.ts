import { headers } from "next/headers";

/**
 * The caller's address and user agent, for rate limiting and the audit trail.
 *
 * `x-forwarded-for` is a client-supplied header and trivially spoofed in general. Behind
 * Railway's proxy the **last** entry is the one Railway itself appended and is the only
 * trustworthy one — taking the first, which is what most snippets do, takes whatever the
 * client put there and makes the per-IP rate limit decorative.
 *
 * NOTE: `src/app/sign-in/actions.ts` carries a private copy of this logic. The two must
 * not drift; consolidate onto this module when that file is next touched.
 */
export interface RequestContext {
  ip: string | null;
  userAgent: string | null;
}

export async function requestContext(): Promise<RequestContext> {
  const headerList = await headers();

  const forwarded = headerList.get("x-forwarded-for");
  const ip = forwarded
    ? (forwarded.split(",").pop()?.trim() ?? null)
    : headerList.get("x-real-ip");

  return { ip: ip || null, userAgent: headerList.get("user-agent") };
}
