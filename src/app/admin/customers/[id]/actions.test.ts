import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Prescribing, and the two authorization questions it sits between.
 *
 * The property this suite exists for: **taking a member into a caseload is administrative,
 * prescribing for them is data-scoped.** Getting that backwards in either direction is a
 * real failure —
 *
 *   both administrative → any admin can write a plan into a stranger's health record
 *   both data-scoped    → a new member has no assignment, so nobody can ever start them
 *
 * Neither would fail loudly. The first looks like a working product; the second looks like
 * a bug in the member page.
 */

const requireRole = vi.fn();
const resolveMemberAccessAudited = vi.fn();
const createAssignmentFromProgramme = vi.fn();
const activateAssignment = vi.fn();
const pauseAssignment = vi.fn();
const findAssignment = vi.fn();
const createAssignment = vi.fn();
const endAssignment = vi.fn();
const organizationToday = vi.fn();
const recordAudit = vi.fn();

vi.mock("@/server/auth/guards", () => ({ requireRole }));
vi.mock("@/server/authorization/member-access", async () => {
  const actual = await vi.importActual<
    typeof import("@/server/authorization/member-access")
  >("@/server/authorization/member-access");
  return { ...actual, resolveMemberAccessAudited };
});
vi.mock("@/server/repositories/assignments", () => ({
  createAssignmentFromProgramme,
  activateAssignment,
  pauseAssignment,
  findAssignment,
}));
vi.mock("@/server/repositories/members", () => ({ createAssignment, endAssignment }));
vi.mock("@/server/repositories/activities", () => ({ organizationToday }));
vi.mock("@/server/repositories/audit-logs", () => ({ recordAudit }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const {
  assignProgrammeAction,
  activateAssignmentAction,
  pauseAssignmentAction,
  takeIntoCaseloadAction,
  releaseFromCaseloadAction,
} = await import("./actions");

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

const CUSTOMER = "11111111-1111-4111-8111-111111111111";
const PROGRAMME = "22222222-2222-4222-8222-222222222222";
const ASSIGNMENT = "33333333-3333-4333-8333-333333333333";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

const VALID = {
  customerId: CUSTOMER,
  programmeId: PROGRAMME,
  startsOn: "2026-09-01",
  activate: "on",
};

beforeEach(() => {
  requireRole.mockReset().mockResolvedValue(SESSION);
  resolveMemberAccessAudited
    .mockReset()
    .mockResolvedValue({ decision: { allowed: true }, memberExists: true });
  createAssignmentFromProgramme
    .mockReset()
    .mockResolvedValue({ id: ASSIGNMENT, kind: "YOGA", customerId: CUSTOMER });
  activateAssignment.mockReset().mockResolvedValue({ activitiesCreated: 28 });
  pauseAssignment.mockReset();
  findAssignment.mockReset().mockResolvedValue({ id: ASSIGNMENT, customerId: CUSTOMER });
  createAssignment.mockReset();
  endAssignment.mockReset();
  organizationToday.mockReset().mockResolvedValue("2026-08-24");
  recordAudit.mockReset();
});

describe("taking a member into a caseload is ADMINISTRATIVE", () => {
  it("does not require existing data reach", async () => {
    /*
     * THE DEADLOCK TEST. A member who has just been added has no assignment, so if this
     * consulted `resolveMemberAccess` the first member could never be taken on — and the
     * symptom would look like a broken button, not an authorization design error.
     */
    resolveMemberAccessAudited.mockResolvedValue({
      decision: { allowed: false, reason: "NOT_ASSIGNED" },
      memberExists: true,
    });

    await takeIntoCaseloadAction(form({ customerId: CUSTOMER }));

    expect(createAssignment).toHaveBeenCalledWith("org-1", "admin-1", CUSTOMER);
    expect(resolveMemberAccessAudited).not.toHaveBeenCalled();
  });

  it("still refuses a non-admin", async () => {
    requireRole.mockResolvedValue({ ...SESSION, role: "USER" });
    await takeIntoCaseloadAction(form({ customerId: CUSTOMER }));
    expect(createAssignment).not.toHaveBeenCalled();
  });

  it("records who took the member on", async () => {
    await takeIntoCaseloadAction(form({ customerId: CUSTOMER }));

    expect(recordAudit.mock.calls[0][0]).toMatchObject({
      action: "caseload.assign",
      resourceId: CUSTOMER,
      outcome: "SUCCESS",
      metadata: { consultantId: "admin-1" },
    });
  });

  it("releases without requiring data reach either", async () => {
    // Releasing must work even after access has already lapsed, or a stale relationship
    // could never be closed.
    resolveMemberAccessAudited.mockResolvedValue({
      decision: { allowed: false, reason: "NOT_ASSIGNED" },
      memberExists: true,
    });

    await releaseFromCaseloadAction(form({ customerId: CUSTOMER }));

    expect(endAssignment).toHaveBeenCalledWith("org-1", "admin-1", CUSTOMER);
  });
});

describe("prescribing is DATA-SCOPED", () => {
  it("refuses an admin with no reach over this member", async () => {
    // The half of ADR-013 that must not widen: being an admin is permission to administer
    // the organisation, never to write into somebody's health record.
    resolveMemberAccessAudited.mockResolvedValue({
      decision: { allowed: false, reason: "NOT_ASSIGNED" },
      memberExists: true,
    });

    const result = await assignProgrammeAction({ status: "IDLE" }, form(VALID));

    expect(result.status).toBe("ERROR");
    expect(createAssignmentFromProgramme).not.toHaveBeenCalled();
  });

  it("gives the same message whether the member is unreachable or absent", async () => {
    // Distinguishing them would confirm a member exists whom this admin may not see.
    resolveMemberAccessAudited.mockResolvedValue({
      decision: { allowed: false, reason: "NOT_ASSIGNED" },
      memberExists: true,
    });
    const unreachable = await assignProgrammeAction({ status: "IDLE" }, form(VALID));

    resolveMemberAccessAudited.mockResolvedValue({
      decision: { allowed: false, reason: "CROSS_ORGANIZATION" },
      memberExists: false,
    });
    const absent = await assignProgrammeAction({ status: "IDLE" }, form(VALID));

    expect(unreachable.message).toBe(absent.message);
  });

  it("audits the attempt through the audited resolver", async () => {
    await assignProgrammeAction({ status: "IDLE" }, form(VALID));

    // The audited variant writes the DENIED row itself, so using it rather than the plain
    // resolver is what makes a refused prescription investigable.
    expect(resolveMemberAccessAudited).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "admin-1", organizationId: "org-1" }),
      CUSTOMER,
      "assignment.create",
    );
  });
});

describe("assigning", () => {
  it("snapshots from the session's organization and activates", async () => {
    const result = await assignProgrammeAction({ status: "IDLE" }, form(VALID));

    expect(createAssignmentFromProgramme).toHaveBeenCalledWith({
      organizationId: "org-1",
      customerId: CUSTOMER,
      assignedBy: "admin-1",
      programmeId: PROGRAMME,
      startsOn: "2026-09-01",
      durationWeeks: undefined,
    });
    expect(activateAssignment).toHaveBeenCalledWith("org-1", ASSIGNMENT);
    expect(result.status).toBe("DONE");
    expect(result.message).toMatch(/28 sessions scheduled/);
  });

  it("leaves it a draft when not activated", async () => {
    const result = await assignProgrammeAction(
      { status: "IDLE" },
      form({ ...VALID, activate: "" }),
    );

    expect(activateAssignment).not.toHaveBeenCalled();
    expect(result.message).toMatch(/draft/i);
  });

  it("refuses a start date before today", async () => {
    // Activities generated for past dates are overdue the moment the plan begins.
    const result = await assignProgrammeAction(
      { status: "IDLE" },
      form({ ...VALID, startsOn: "2026-08-01" }),
    );

    expect(result.status).toBe("ERROR");
    expect(createAssignmentFromProgramme).not.toHaveBeenCalled();
  });

  it("reports a programme from another tenant as unavailable", async () => {
    createAssignmentFromProgramme.mockRejectedValue(new Error("Programme not found."));

    const result = await assignProgrammeAction({ status: "IDLE" }, form(VALID));

    expect(result.status).toBe("ERROR");
    expect(result.message).toMatch(/not available/i);
  });

  it("rethrows an unrecognised failure", async () => {
    createAssignmentFromProgramme.mockRejectedValue(new Error("connection terminated"));
    await expect(assignProgrammeAction({ status: "IDLE" }, form(VALID))).rejects.toThrow(
      /connection terminated/,
    );
  });
});

describe("activate and pause", () => {
  it("refuses an assignment belonging to a different member", async () => {
    /*
     * THE IDOR TEST. The id is posted from a form on one member's page; without this check
     * an admin could start or pause somebody else's plan by editing it — and the member
     * whose page it was would look untouched.
     */
    findAssignment.mockResolvedValue({ id: ASSIGNMENT, customerId: "someone-else" });

    await activateAssignmentAction(form({ customerId: CUSTOMER, assignmentId: ASSIGNMENT }));
    await pauseAssignmentAction(form({ customerId: CUSTOMER, assignmentId: ASSIGNMENT }));

    expect(activateAssignment).not.toHaveBeenCalled();
    expect(pauseAssignment).not.toHaveBeenCalled();
  });

  it("activates when the assignment belongs to the member", async () => {
    await activateAssignmentAction(form({ customerId: CUSTOMER, assignmentId: ASSIGNMENT }));
    expect(activateAssignment).toHaveBeenCalledWith("org-1", ASSIGNMENT);
  });

  it("pauses when the assignment belongs to the member", async () => {
    await pauseAssignmentAction(form({ customerId: CUSTOMER, assignmentId: ASSIGNMENT }));
    expect(pauseAssignment).toHaveBeenCalledWith("org-1", ASSIGNMENT);
  });

  it("does nothing without data reach", async () => {
    resolveMemberAccessAudited.mockResolvedValue({
      decision: { allowed: false, reason: "NOT_ASSIGNED" },
      memberExists: true,
    });

    await activateAssignmentAction(form({ customerId: CUSTOMER, assignmentId: ASSIGNMENT }));
    await pauseAssignmentAction(form({ customerId: CUSTOMER, assignmentId: ASSIGNMENT }));

    expect(activateAssignment).not.toHaveBeenCalled();
    expect(pauseAssignment).not.toHaveBeenCalled();
  });
});
