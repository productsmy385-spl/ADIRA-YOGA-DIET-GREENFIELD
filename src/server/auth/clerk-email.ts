/**
 * Which address a Clerk user has PROVED — pure, so it is testable without Clerk.
 *
 * The primary address, and only if Clerk has verified it. An unverified address is one
 * somebody typed, not one they control: linking on it would let anyone claim an invited
 * account by registering its email in Clerk. Primary only, so a secondary address added
 * later cannot reach a different person's account (ADR-015).
 */
export interface ClerkEmailShape {
  primaryEmailAddressId: string | null;
  emailAddresses: Array<{
    id: string;
    emailAddress: string;
    verification: { status: string } | null;
  }>;
}

export function verifiedPrimaryEmailOf(user: ClerkEmailShape): string | null {
  const primary = user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId);
  if (!primary || primary.verification?.status !== "verified") return null;
  return primary.emailAddress.trim().toLowerCase();
}
