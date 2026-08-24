import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The security properties of adding a member, tested without a database.
 *
 * Not the happy path for its own sake — what matters here is the set of things a future
 * edit could break silently:
 *
 *   1. The organization comes from the SESSION. A form field named `organizationId` must
 *      have no effect whatsoever (ADR-004).
 *   2. The role is USER and cannot be influenced by the request.
 *   3. The account is INVITED, so it cannot sign in until the address is proven.
 *   4. A non-admin gets nothing.
 *
 * All four would still "work" if broken — the form would submit, a row would appear — which
 * is exactly why they are asserted rather than trusted.
 */

const requireRole = vi.fn();
const createUser = vi.fn();
const recordAudit = vi.fn();
const revalidatePath = vi.fn();

vi.mock("@/server/auth/guards", () => ({ requireRole }));
vi.mock("@/server/repositories/users", () => ({ createUser }));
vi.mock("@/server/repositories/audit-logs", () => ({ recordAudit }));
vi.mock("next/cache", () => ({ revalidatePath }));

const { addMemberAction } = await import("./actions");

const SESSION = {
  sessionId: "s",
  userId: "admin-1",
  organizationId: "org-1",
  role: "ADMIN" as const,
  email: "admin@studio.test",
  fullName: "An Admin",
  organizationName: "Studio",
  locale: "en",
  issuedAt: new Date(),
  expiresAt: new Date(Date.now() + 3_600_000),
};

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

const VALID = { fullName: "Asha Rao", email: "asha@example.com", locale: "en" };

beforeEach(() => {
  requireRole.mockReset().mockResolvedValue(SESSION);
  createUser.mockReset().mockResolvedValue({ id: "user-9" });
  recordAudit.mockReset();
  revalidatePath.mockReset();
});

describe("tenant scope", () => {
  it("takes the organization from the session", async () => {
    await addMemberAction({ status: "IDLE" }, form(VALID));

    expect(createUser).toHaveBeenCalledTimes(1);
    expect(createUser.mock.calls[0][0].organizationId).toBe("org-1");
  });

  it("ignores an organizationId supplied by the client", async () => {
    // The whole of ADR-004 in one assertion. If this ever passed through, an admin could
    // create members inside another studio by editing the form.
    await addMemberAction(
      { status: "IDLE" },
      form({ ...VALID, organizationId: "org-somebody-else" }),
    );

    expect(createUser.mock.calls[0][0].organizationId).toBe("org-1");
  });
});

describe("role and status cannot be influenced by the request", () => {
  it("creates a USER, even when the form asks for ADMIN", async () => {
    await addMemberAction({ status: "IDLE" }, form({ ...VALID, role: "ADMIN" }));

    expect(createUser.mock.calls[0][0].role).toBe("USER");
  });

  it("creates the account INVITED, even when the form asks for ACTIVE", async () => {
    // An ACTIVE account can hold a session. Honouring this field would mean an admin
    // could create a signed-in-capable account for an address nobody has proven they own.
    await addMemberAction({ status: "IDLE" }, form({ ...VALID, status: "ACTIVE" }));

    expect(createUser.mock.calls[0][0].status).toBe("INVITED");
  });
});

describe("authorization", () => {
  it("refuses a plain member", async () => {
    // requireRole would normally redirect first; this covers the case where it is ever
    // relaxed, so the capability check is load-bearing on its own.
    requireRole.mockResolvedValue({ ...SESSION, role: "USER" });

    const result = await addMemberAction({ status: "IDLE" }, form(VALID));

    expect(result.status).toBe("ERROR");
    expect(createUser).not.toHaveBeenCalled();
  });
});

describe("validation", () => {
  it("rejects a malformed email without touching the database", async () => {
    const result = await addMemberAction(
      { status: "IDLE" },
      form({ ...VALID, email: "not-an-address" }),
    );

    expect(result.status).toBe("ERROR");
    expect(result.fieldErrors?.email).toBeTruthy();
    expect(createUser).not.toHaveBeenCalled();
  });

  it("rejects an empty name", async () => {
    const result = await addMemberAction({ status: "IDLE" }, form({ ...VALID, fullName: " " }));

    expect(result.status).toBe("ERROR");
    expect(result.fieldErrors?.fullName).toBeTruthy();
    expect(createUser).not.toHaveBeenCalled();
  });

  it("normalises the email to lower case", async () => {
    // `users.email` has a CHECK that it equals lower(email), so an unnormalised value
    // fails at the INSERT rather than in validation — a worse error, later.
    await addMemberAction({ status: "IDLE" }, form({ ...VALID, email: "Asha@Example.COM" }));

    expect(createUser.mock.calls[0][0].email).toBe("asha@example.com");
  });

  it("treats a blank phone as absent rather than empty", async () => {
    await addMemberAction({ status: "IDLE" }, form({ ...VALID, phone: "  " }));

    expect(createUser.mock.calls[0][0].phone).toBeNull();
  });

  it("refuses an unsupported language", async () => {
    const result = await addMemberAction({ status: "IDLE" }, form({ ...VALID, locale: "fr" }));

    expect(result.status).toBe("ERROR");
    expect(createUser).not.toHaveBeenCalled();
  });
});

describe("auditing", () => {
  it("records the creation without duplicating personal data", async () => {
    await addMemberAction({ status: "IDLE" }, form({ ...VALID, phone: "+91 90000 00000" }));

    const entry = recordAudit.mock.calls[0][0];
    expect(entry).toMatchObject({
      organizationId: "org-1",
      actorId: "admin-1",
      action: "member.create",
      outcome: "SUCCESS",
      resourceId: "user-9",
    });

    // Audit rows outlive the accounts they describe, so they carry the ids and the
    // decision — not the name, the address, or the phone number.
    const serialised = JSON.stringify(entry.metadata);
    expect(serialised).not.toContain("asha@example.com");
    expect(serialised).not.toContain("Asha Rao");
    expect(serialised).not.toContain("90000");
  });

  it("refreshes the member list only after a successful write", async () => {
    revalidatePath.mockReset();
    await addMemberAction({ status: "IDLE" }, form({ ...VALID, email: "bad" }));
    expect(revalidatePath).not.toHaveBeenCalled();

    await addMemberAction({ status: "IDLE" }, form(VALID));
    expect(revalidatePath).toHaveBeenCalledWith("/admin/members");
  });
});

describe("duplicate address", () => {
  it("reports it as a field error rather than throwing", async () => {
    createUser.mockRejectedValue(
      Object.assign(new Error("duplicate"), {
        code: "23505",
        constraint: "users_email_unique_per_org",
      }),
    );

    const result = await addMemberAction({ status: "IDLE" }, form(VALID));

    expect(result.status).toBe("ERROR");
    expect(result.fieldErrors?.email).toBeTruthy();
  });

  it("rethrows anything it does not recognise", async () => {
    // Swallowing an unknown database error would turn a real fault into "check the form",
    // and the admin would retype a correct address until they gave up.
    createUser.mockRejectedValue(new Error("connection terminated"));

    await expect(addMemberAction({ status: "IDLE" }, form(VALID))).rejects.toThrow(
      /connection terminated/,
    );
  });
});
