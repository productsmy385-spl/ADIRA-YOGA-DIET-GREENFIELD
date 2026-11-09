/**
 * Clerk's Frontend API origin, decoded from the publishable key (ADR-015).
 *
 * A publishable key is `pk_<test|live>_<base64("<host>$")>`. Deriving the CSP origin from
 * it, rather than configuring it separately, means the policy cannot drift from the key:
 * a development instance (`*.clerk.accounts.dev`) and a production one
 * (`clerk.<your-domain>`) each get exactly their own host.
 *
 * Returns null for anything malformed, and the host is checked against a strict character
 * set so a crafted key cannot inject extra CSP directives.
 */
export function clerkFrontendApiOrigin(publishableKey: string | undefined): string | null {
  const encoded = publishableKey?.split("_")[2];
  if (!encoded) return null;

  const host = Buffer.from(encoded, "base64").toString("utf8").replace(/\$$/, "");
  return /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(host) ? `https://${host}` : null;
}
