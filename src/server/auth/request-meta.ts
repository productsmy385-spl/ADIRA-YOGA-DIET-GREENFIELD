import { headers } from "next/headers";

import type { RequestMeta } from "./sign-in";

/**
 * The caller's address and user agent, for the audit trail.
 *
 * `x-forwarded-for` is client-supplied. Behind Railway's proxy the LAST entry is the one
 * Railway appended and the only trustworthy one — the usual "take the first" snippet takes
 * whatever the client wrote there.
 */
export async function requestMeta(): Promise<RequestMeta> {
  const headerList = await headers();

  const forwarded = headerList.get("x-forwarded-for");
  const ip = forwarded
    ? (forwarded.split(",").pop()?.trim() ?? null)
    : headerList.get("x-real-ip");

  return { ip: ip || null, userAgent: headerList.get("user-agent") };
}
