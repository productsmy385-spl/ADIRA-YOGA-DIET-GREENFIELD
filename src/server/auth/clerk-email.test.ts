import { describe, expect, it } from "vitest";

import { verifiedPrimaryEmailOf } from "./clerk-email";

const user = (
  primaryId: string | null,
  emails: Array<[id: string, address: string, status: string | null]>,
) => ({
  primaryEmailAddressId: primaryId,
  emailAddresses: emails.map(([id, emailAddress, status]) => ({
    id,
    emailAddress,
    verification: status ? { status } : null,
  })),
});

describe("verifiedPrimaryEmailOf", () => {
  it("returns the verified primary address, lowercased and trimmed", () => {
    expect(verifiedPrimaryEmailOf(user("e1", [["e1", " Asha@Example.COM ", "verified"]]))).toBe(
      "asha@example.com",
    );
  });

  // The rule that makes linking safe: an address somebody merely typed proves nothing.
  it("returns null when the primary address is not verified", () => {
    expect(verifiedPrimaryEmailOf(user("e1", [["e1", "a@example.com", "unverified"]]))).toBeNull();
    expect(verifiedPrimaryEmailOf(user("e1", [["e1", "a@example.com", null]]))).toBeNull();
  });

  // A verified SECONDARY address must not be used: it would let a person reach an
  // account invited under an address that is not their primary identity.
  it("ignores a verified secondary address", () => {
    expect(
      verifiedPrimaryEmailOf(
        user("e1", [
          ["e1", "primary@example.com", "unverified"],
          ["e2", "secondary@example.com", "verified"],
        ]),
      ),
    ).toBeNull();
  });

  it("returns null when there is no primary address", () => {
    expect(verifiedPrimaryEmailOf(user(null, [["e1", "a@example.com", "verified"]]))).toBeNull();
  });
});
