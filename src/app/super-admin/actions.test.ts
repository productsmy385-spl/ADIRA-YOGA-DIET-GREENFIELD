import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The platform console's write actions, and the line they must not cross.
 *
 * A SUPER_ADMIN administers ORGANIZATIONS and the ADMINISTRATORS inside them. The failure
 * this suite is built around is the one that would be easiest to introduce and hardest to
 * notice: the console quietly gaining reach over people rather than over tenants.
 *
 * Nothing here should ever touch activities, check-ins, reports or assignments — so the
 * repositories for those are not even mocked. If an action started importing one, this
 * file would fail to run, which is the loudest possible signal.
 */

const requirePlatformSession = vi.fn();
const createOrganization = vi.fn();
const findOrganizationById = vi.fn();
const setOrganizationStatus = vi.fn();
const createUser = vi.fn();
const findUserById = vi.fn();
const setUserStatus = vi.fn();
const recordAudit = vi.fn();

vi.mock("@/server/auth/guards", () => ({ requirePlatformSession }));
vi.mock("@/server/repositories/organizations", () => ({
  createOrganization,
  findOrganizationById,
  setOrganizationStatus,
}));
vi.mock("@/server/repositories/users", () => ({ createUser, findUserById, setUserStatus }));
vi.mock("@/server/repositories/audit-logs", () => ({ recordAudit }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const {
  createOrganizationAction,
  setOrganizationStatusAction,
  createAdminAction,
  setAdminStatusAction,
} = await import("./actions");

const PLATFORM = {
  sessionId: "ps",
  ownerAccountId: "owner-1",
  email: "operator@adira.test",
  fullName: "Platform Operator",
  issuedAt: new Date(),
  expiresAt: new Date(Date.now() + 3_600_000),
  lastUsedAt: new Date(),
};

const ORG = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

beforeEach(() => {
  requirePlatformSession.mockReset().mockResolvedValue(PLATFORM);
  createOrganization
    .mockReset()
    .mockResolvedValue({ id: ORG, name: "Studio", slug: "studio", status: "ACTIVE" });
  findOrganizationById
    .mockReset()
    .mockResolvedValue({ id: ORG, name: "Studio", slug: "studio", status: "ACTIVE" });
  setOrganizationStatus.mockReset();
  createUser.mockReset().mockResolvedValue({ id: USER, fullName: "An Admin" });
  findUserById.mockReset().mockResolvedValue({ id: USER, role: "ADMIN", status: "ACTIVE" });
  setUserStatus.mockReset();
  recordAudit.mockReset();
});

describe("every action requires a PLATFORM session", () => {
  it("uses requirePlatformSession, never a tenant guard", async () => {
    // ADR-001: the two domains read different cookies signed with different secrets. A
    // tenant guard here would mean an ADMIN could reach the platform console.
    await createOrganizationAction({ status: "IDLE" }, form({ name: "S", slug: "s" }));
    await setOrganizationStatusAction(form({ organizationId: ORG, status: "SUSPENDED" }));
    await createAdminAction(
      { status: "IDLE" },
      form({ organizationId: ORG, email: "a@b.test", fullName: "A" }),
    );
    await setAdminStatusAction(
      form({ userId: USER, organizationId: ORG, status: "SUSPENDED" }),
    );

    expect(requirePlatformSession).toHaveBeenCalledTimes(4);
  });
});

describe("creating an organization", () => {
  it("creates it with self-registration closed", async () => {
    const result = await createOrganizationAction(
      { status: "IDLE" },
      form({ name: "Studio A", slug: "studio-a" }),
    );

    expect(result.status).toBe("DONE");
    // A join code opens a public signup route. Inheriting one from a default is a
    // decision nobody remembers making.
    expect(createOrganization.mock.calls[0][0].joinCode).toBeNull();
  });

  it("rejects a slug that is not URL-safe", async () => {
    // "st" is deliberately absent: two characters is short but legitimate for a slug,
    // and the schema's min(2) allows it on purpose.
    for (const slug of ["Studio A", "studio_a", "-studio", "studio--a", "studio-", ""]) {
      createOrganization.mockClear();
      const result = await createOrganizationAction(
        { status: "IDLE" },
        form({ name: "Studio", slug }),
      );
      expect(result.status).toBe("ERROR");
      expect(createOrganization).not.toHaveBeenCalled();
    }
  });

  it("reports a taken slug as a field error", async () => {
    createOrganization.mockRejectedValue(
      Object.assign(new Error("dup"), { code: "23505", constraint: "organizations_slug_key" }),
    );

    const result = await createOrganizationAction(
      { status: "IDLE" },
      form({ name: "Studio", slug: "studio" }),
    );

    expect(result.status).toBe("ERROR");
    expect(result.fieldErrors?.slug).toBeTruthy();
  });

  it("audits in the PLATFORM domain", async () => {
    await createOrganizationAction({ status: "IDLE" }, form({ name: "S", slug: "studio" }));

    // Tenant and platform activity must stay distinguishable in one trail.
    expect(recordAudit.mock.calls[0][0]).toMatchObject({
      actorDomain: "PLATFORM",
      actorId: "owner-1",
      action: "organization.create",
    });
  });
});

describe("provisioning an administrator", () => {
  const VALID = { organizationId: ORG, email: "admin@studio.test", fullName: "An Admin" };

  it("creates an ADMIN, invited not active", async () => {
    const result = await createAdminAction({ status: "IDLE" }, form(VALID));

    expect(result.status).toBe("DONE");
    expect(createUser.mock.calls[0][0]).toMatchObject({
      organizationId: ORG,
      role: "ADMIN",
      // The platform operator does not activate anybody; the administrator proves
      // control of the address by signing in.
      status: "INVITED",
    });
  });

  it("validates the organization rather than trusting the posted id", async () => {
    /*
     * The one place `organizationId` legitimately comes from the request — a platform
     * session has no organization to take it from. So the id is resolved, and an
     * unknown one is refused.
     */
    findOrganizationById.mockResolvedValue(null);

    const result = await createAdminAction({ status: "IDLE" }, form(VALID));

    expect(result.status).toBe("ERROR");
    expect(createUser).not.toHaveBeenCalled();
  });

  it("grants no member data reach", async () => {
    // A new ADMIN has no consultant_assignments, so under ADR-013 they administer the
    // organisation and can read nobody's practice until somebody is assigned to them.
    // Nothing in this path may create an assignment.
    await createAdminAction({ status: "IDLE" }, form(VALID));

    const created = createUser.mock.calls[0][0];
    expect(created).not.toHaveProperty("assignments");
    expect(JSON.stringify(created)).not.toMatch(/assignment|caseload/i);
  });

  it("reports a duplicate address without confirming anything about other tenants", async () => {
    createUser.mockRejectedValue(
      Object.assign(new Error("dup"), {
        code: "23505",
        constraint: "users_email_unique_per_org",
      }),
    );

    const result = await createAdminAction({ status: "IDLE" }, form(VALID));

    expect(result.status).toBe("ERROR");
    // Scoped per organisation: it says the address is taken HERE, which is all the
    // operator is being told.
    expect(result.message).toMatch(/this organisation/i);
  });
});

describe("suspending", () => {
  it("suspends an organization and records the transition", async () => {
    await setOrganizationStatusAction(form({ organizationId: ORG, status: "SUSPENDED" }));

    expect(setOrganizationStatus).toHaveBeenCalledWith(ORG, "SUSPENDED");
    expect(recordAudit.mock.calls[0][0].metadata).toMatchObject({
      from: "ACTIVE",
      to: "SUSPENDED",
    });
  });

  it("refuses a status outside the enum", async () => {
    await setOrganizationStatusAction(form({ organizationId: ORG, status: "DELETED" }));
    expect(setOrganizationStatus).not.toHaveBeenCalled();
  });

  it("REFUSES to suspend a plain member", async () => {
    /*
     * THE LINE. Suspending a MEMBER is acting on a person inside a tenant rather than on
     * the tenant's administration — much closer to touching member data than to platform
     * operations. Without this check, posting a member's id to the admin-suspend control
     * would work.
     */
    findUserById.mockResolvedValue({ id: USER, role: "USER", status: "ACTIVE" });

    await setAdminStatusAction(
      form({ userId: USER, organizationId: ORG, status: "SUSPENDED" }),
    );

    expect(setUserStatus).not.toHaveBeenCalled();
  });

  it("suspends a legacy ORG_OWNER, which is an administrator", async () => {
    findUserById.mockResolvedValue({ id: USER, role: "ORG_OWNER", status: "ACTIVE" });

    await setAdminStatusAction(
      form({ userId: USER, organizationId: ORG, status: "SUSPENDED" }),
    );

    expect(setUserStatus).toHaveBeenCalledWith(USER, ORG, "SUSPENDED");
  });

  it("refuses a user who does not belong to the named organization", async () => {
    // The pair is posted together; without resolving the user WITHIN the organization a
    // crafted pair could suspend somebody in a different tenant than the row shown.
    findUserById.mockResolvedValue(null);

    await setAdminStatusAction(
      form({ userId: USER, organizationId: ORG, status: "SUSPENDED" }),
    );

    expect(setUserStatus).not.toHaveBeenCalled();
  });
});
