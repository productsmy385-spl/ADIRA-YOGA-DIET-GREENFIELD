import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TenantSessionContext } from "@/server/repositories/sessions";

/**
 * The member lookup is the only impure part of the policy, so it is mocked and the rules
 * around it are tested exactly. Whether `resolveMemberAccess` decides correctly is its own
 * suite's job; this one asserts that the upload policy asks it at all, asks it for the
 * right member, and does the right thing with each answer.
 */
const resolveMemberAccess = vi.fn();

vi.mock("@/server/authorization/member-access", async () => {
  const actual = await vi.importActual<
    typeof import("@/server/authorization/member-access")
  >("@/server/authorization/member-access");
  return { ...actual, resolveMemberAccess };
});

const { decideUpload, denialResponse } = await import("./upload-policy");

function session(role: "ADMIN" | "USER", userId = "user-1"): TenantSessionContext {
  return {
    sessionId: "session-1",
    userId,
    organizationId: "org-1",
    role,
    email: "person@example.com",
    fullName: "A Person",
    locale: "en",
    issuedAt: new Date(),
    expiresAt: new Date(Date.now() + 3_600_000),
  } as TenantSessionContext;
}

beforeEach(() => {
  resolveMemberAccess.mockReset();
});

describe("library media", () => {
  it("lets an admin upload exercise and meal media", async () => {
    for (const purpose of ["exercise", "meal"] as const) {
      await expect(decideUpload(session("ADMIN"), purpose, null)).resolves.toEqual({
        allowed: true,
        customerId: null,
      });
    }
    // Library media is organization-wide, so no member lookup should have happened.
    expect(resolveMemberAccess).not.toHaveBeenCalled();
  });

  it("refuses a plain member", async () => {
    await expect(decideUpload(session("USER"), "exercise", null)).resolves.toEqual({
      allowed: false,
      reason: "NOT_PERMITTED",
    });
  });

  it("drops a customer id smuggled onto library media", async () => {
    // Honouring it would attach an organization-wide asset to one member's record on the
    // strength of an administrative check that never considered that member.
    await expect(
      decideUpload(session("ADMIN"), "exercise", "member-9"),
    ).resolves.toEqual({ allowed: true, customerId: null });
    expect(resolveMemberAccess).not.toHaveBeenCalled();
  });
});

describe("member media", () => {
  it("requires a member", async () => {
    await expect(decideUpload(session("ADMIN"), "progress_photo", null)).resolves.toEqual({
      allowed: false,
      reason: "MEMBER_REQUIRED",
    });
    expect(resolveMemberAccess).not.toHaveBeenCalled();
  });

  it("asks about the member named in the request", async () => {
    resolveMemberAccess.mockResolvedValue({
      decision: { allowed: true },
      memberExists: true,
    });

    await expect(
      decideUpload(session("ADMIN"), "progress_photo", "member-7"),
    ).resolves.toEqual({ allowed: true, customerId: "member-7" });

    expect(resolveMemberAccess).toHaveBeenCalledTimes(1);
    expect(resolveMemberAccess.mock.calls[0][1]).toBe("member-7");
    // The actor must be built from the SESSION, never from the request body (ADR-004).
    expect(resolveMemberAccess.mock.calls[0][0]).toMatchObject({
      organizationId: "org-1",
      userId: "user-1",
      role: "ADMIN",
    });
  });

  it("refuses an admin with no reach over that member", async () => {
    // ADR-013: ADMIN is administrative, not org-wide data reach. Being an admin is not a
    // licence to upload a photo of someone outside the caseload.
    resolveMemberAccess.mockResolvedValue({
      decision: { allowed: false, reason: "NOT_ASSIGNED" },
      memberExists: true,
    });

    await expect(
      decideUpload(session("ADMIN"), "progress_photo", "member-7"),
    ).resolves.toEqual({ allowed: false, reason: "MEMBER_NOT_ALLOWED" });
  });

  it("refuses an unknown member", async () => {
    resolveMemberAccess.mockResolvedValue({
      decision: { allowed: false, reason: "CROSS_ORGANIZATION" },
      memberExists: false,
    });

    await expect(
      decideUpload(session("ADMIN"), "avatar", "member-elsewhere"),
    ).resolves.toEqual({ allowed: false, reason: "UNKNOWN_MEMBER" });
  });
});

describe("denial responses", () => {
  it("does not distinguish an unknown member from an unreachable one", () => {
    // THE ORACLE PROPERTY. If these differed, an admin could enumerate another
    // consultant's caseload — and every member of the organization — by watching which
    // ids answer 403 and which answer 404.
    expect(denialResponse("UNKNOWN_MEMBER")).toEqual(
      denialResponse("MEMBER_NOT_ALLOWED"),
    );
  });

  it("reports a permission failure as 403 and a bad request as 400", () => {
    expect(denialResponse("NOT_PERMITTED").status).toBe(403);
    expect(denialResponse("MEMBER_REQUIRED").status).toBe(400);
  });

  it("never names a role or a reason code in the message", () => {
    // An error that spells out which role would have sufficed is a small map of the
    // privilege model, handed to whoever probed for it.
    for (const reason of [
      "NOT_PERMITTED",
      "MEMBER_REQUIRED",
      "UNKNOWN_MEMBER",
      "MEMBER_NOT_ALLOWED",
    ] as const) {
      const { error } = denialResponse(reason);
      expect(error).not.toMatch(/ADMIN|USER|ORG_OWNER|assign|caseload|_/);
    }
  });
});
