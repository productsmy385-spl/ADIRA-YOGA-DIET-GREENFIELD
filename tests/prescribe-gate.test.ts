import { beforeEach, expect, it } from "vitest";

import { query } from "@/server/db/pool";
import { createAssignmentFromProgramme } from "@/server/repositories/assignments";
import { listCaseload } from "@/server/repositories/caseload";
import { createAssignment } from "@/server/repositories/members";
import { createOrganization } from "@/server/repositories/organizations";
import {
  addProgrammeItem,
  createProgramme,
  listProgrammes,
  publishProgramme,
  unpublishProgramme,
} from "@/server/repositories/programmes";
import { createUser } from "@/server/repositories/users";
import { createYogaExercise } from "@/server/repositories/library";

import { describeIsolated, resetDatabase } from "./helpers/sql-db";

/**
 * The two defects that together made prescribing impossible, pinned so they cannot return.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 1. THE PUBLISH GATE WAS DOCUMENTED BUT NOT IMPLEMENTED
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Migration 009 states its purpose as "a programme cannot be assigned until someone
 * deliberately publishes it". `publishProgramme` was written, refused empty programmes
 * correctly, and was covered by tests — but `createAssignmentFromProgramme` filtered only
 * on `archived_at IS NULL`, so the rule the migration exists for was never enforced on
 * the path that mattered. A half-built draft could be snapshotted into a member's plan.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 2. THE CASELOAD QUERY MATCHED ONLY THE PRE-MERGE ROLE LABEL
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Migration 006 added `USER` and 007 backfilled to it, so every member created after the
 * merge carries `USER`. `listCaseload` still matched `role = 'CUSTOMER'` alone, which
 * meant a newly added member was absent from their consultant's caseload however they
 * were assigned. It presented as an empty page — indistinguishable from "nobody assigned
 * yet", which is why it survived.
 *
 * Both are regressions a unit test cannot catch: the first is a WHERE clause, the second
 * is an enum label. Only a real database answers either.
 */

interface Fixture {
  orgId: string;
  adminId: string;
  memberId: string;
  exerciseId: string;
}

async function seed(): Promise<Fixture> {
  const org = await createOrganization({ name: "Studio", slug: "studio" });

  const admin = await createUser({
    organizationId: org.id,
    email: "admin@studio.test",
    fullName: "Admin",
    role: "ADMIN",
    status: "ACTIVE",
  });

  // Deliberately the POST-MERGE label. A fixture using 'CUSTOMER' would pass against the
  // old query and prove nothing about the bug this file exists for.
  const member = await createUser({
    organizationId: org.id,
    email: "member@studio.test",
    fullName: "Member",
    role: "USER",
    status: "ACTIVE",
  });

  const exercise = await createYogaExercise(org.id, { name: "Tadasana" });

  return {
    orgId: org.id,
    adminId: admin.id,
    memberId: member.id,
    exerciseId: exercise.id,
  };
}

async function programmeWithOneItem(f: Fixture, name: string): Promise<string> {
  const programme = await createProgramme(f.orgId, {
    kind: "YOGA",
    name,
    durationWeeks: 1,
  });

  await addProgrammeItem(f.orgId, programme.id, {
    weekNumber: 1,
    dayOfWeek: 1,
    sequence: 0,
    yogaExerciseId: f.exerciseId,
  });

  return programme.id;
}

describeIsolated("prescribing gate and caseload visibility", () => {
  let f: Fixture;

  beforeEach(async () => {
    await resetDatabase();
    f = await seed();
  });

  /* ── the publish gate ────────────────────────────────────────────────── */

  it("refuses to assign a programme that has never been published", async () => {
    const draft = await programmeWithOneItem(f, "Draft Programme");

    await expect(
      createAssignmentFromProgramme({
        organizationId: f.orgId,
        customerId: f.memberId,
        assignedBy: f.adminId,
        programmeId: draft,
        startsOn: "2026-09-01",
      }),
    ).rejects.toThrow("Programme not found.");

    // And nothing was half-written: the refusal happens before the INSERT.
    const rows = await query<{ id: string }>(
      `SELECT id FROM assignments WHERE organization_id = $1`,
      [f.orgId],
    );
    expect(rows).toHaveLength(0);
  });

  it("assigns the same programme once it is published", async () => {
    const programme = await programmeWithOneItem(f, "Foundation");
    expect(await publishProgramme(f.orgId, programme)).toEqual({ ok: true });

    const assignment = await createAssignmentFromProgramme({
      organizationId: f.orgId,
      customerId: f.memberId,
      assignedBy: f.adminId,
      programmeId: programme,
      startsOn: "2026-09-01",
    });

    expect(assignment.name).toBe("Foundation");
    expect(assignment.sourceProgrammeId).toBe(programme);
  });

  /*
   * Unpublishing withdraws a template from circulation. Existing assignments keep their
   * snapshot (ADR-009) — withdrawing a template is not a reason to delete somebody's
   * plan — but no NEW assignment may be made from it.
   */
  it("stops assigning a programme that has been unpublished, without disturbing existing plans", async () => {
    const programme = await programmeWithOneItem(f, "Withdrawn");
    await publishProgramme(f.orgId, programme);

    const existing = await createAssignmentFromProgramme({
      organizationId: f.orgId,
      customerId: f.memberId,
      assignedBy: f.adminId,
      programmeId: programme,
      startsOn: "2026-09-01",
    });

    expect(await unpublishProgramme(f.orgId, programme)).toBe(true);

    await expect(
      createAssignmentFromProgramme({
        organizationId: f.orgId,
        customerId: f.memberId,
        assignedBy: f.adminId,
        programmeId: programme,
        startsOn: "2026-09-08",
      }),
    ).rejects.toThrow("Programme not found.");

    const survivors = await query<{ id: string; name: string }>(
      `SELECT id, name FROM assignments WHERE id = $1`,
      [existing.id],
    );
    expect(survivors).toHaveLength(1);
    expect(survivors[0].name).toBe("Withdrawn");
  });

  it("offers only published programmes to the prescribe list, while the builder still sees drafts", async () => {
    const draft = await programmeWithOneItem(f, "Still Building");
    const live = await programmeWithOneItem(f, "Ready");
    await publishProgramme(f.orgId, live);

    const prescribable = await listProgrammes(f.orgId, undefined, false, true);
    expect(prescribable.map((p) => p.id)).toEqual([live]);

    // The programmes page must keep showing the draft — an admin has to be able to see
    // the thing they are still building.
    const everything = await listProgrammes(f.orgId);
    expect(everything.map((p) => p.id).sort()).toEqual([draft, live].sort());
  });

  /* ── caseload visibility across the role merge ───────────────────────── */

  it("shows a post-merge USER member on the caseload of the admin they are assigned to", async () => {
    await createAssignment(f.orgId, f.adminId, f.memberId);

    const caseload = await listCaseload({
      domain: "TENANT",
      userId: f.adminId,
      organizationId: f.orgId,
      role: "ADMIN",
    });

    expect(caseload.map((c) => c.customerId)).toEqual([f.memberId]);
    expect(caseload[0].fullName).toBe("Member");
  });

  it("still shows a legacy CUSTOMER member, so the merge did not drop pre-migration rows", async () => {
    const legacy = await createUser({
      organizationId: f.orgId,
      email: "legacy@studio.test",
      fullName: "Legacy",
      role: "CUSTOMER",
      status: "ACTIVE",
    });

    await createAssignment(f.orgId, f.adminId, legacy.id);
    await createAssignment(f.orgId, f.adminId, f.memberId);

    const caseload = await listCaseload({
      domain: "TENANT",
      userId: f.adminId,
      organizationId: f.orgId,
      role: "ADMIN",
    });

    expect(caseload.map((c) => c.fullName).sort()).toEqual(["Legacy", "Member"]);
  });

  it("does not show a member who is not assigned to this admin", async () => {
    const other = await createUser({
      organizationId: f.orgId,
      email: "other@studio.test",
      fullName: "Unassigned",
      role: "USER",
      status: "ACTIVE",
    });

    await createAssignment(f.orgId, f.adminId, f.memberId);

    const caseload = await listCaseload({
      domain: "TENANT",
      userId: f.adminId,
      organizationId: f.orgId,
      role: "ADMIN",
    });

    expect(caseload.map((c) => c.customerId)).toEqual([f.memberId]);
    expect(caseload.map((c) => c.customerId)).not.toContain(other.id);
  });
});
