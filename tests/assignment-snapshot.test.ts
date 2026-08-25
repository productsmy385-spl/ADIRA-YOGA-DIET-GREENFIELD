import {beforeEach, expect, it} from "vitest";

import { query } from "@/server/db/pool";
import {
  activateAssignment,
  createAssignmentFromProgramme,
  listAssignmentsForCustomer,
  pauseAssignment,
} from "@/server/repositories/assignments";
import { createOrganization } from "@/server/repositories/organizations";
import { createUser } from "@/server/repositories/users";

import {describeIsolated, resetDatabase} from "./helpers/sql-db";

/**
 * ADR-009, proved against a real database.
 *
 * The claim is that editing a programme template cannot reach a customer who was already
 * assigned it. That is the difference between an adherence figure that means something
 * and one that silently changes when a consultant fixes a typo — so it is worth proving
 * rather than asserting.
 */


interface Fixture {
  orgId: string;
  customerId: string;
  adminId: string;
  programmeId: string;
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

  const customer = await createUser({
    organizationId: org.id,
    email: "anita@studio.test",
    fullName: "Anita",
    role: "CUSTOMER",
    status: "ACTIVE",
  });

  const [exercise] = await query<{ id: string }>(
    `INSERT INTO yoga_exercises
       (organization_id, name, instructions, breathing, default_duration_seconds)
     VALUES ($1, 'Surya Namaskar', 'Twelve rounds, slowly.', 'Inhale rising, exhale folding.', 600)
     RETURNING id`,
    [org.id],
  );

  const [programme] = await query<{ id: string }>(
    /*
     * PUBLISHED at insert, because assignment now requires it.
     *
     * Migration 009 says a programme cannot be assigned until somebody deliberately
     * publishes it, and `createAssignmentFromProgramme` enforces that. This fixture is
     * exercising snapshot and lifecycle behaviour rather than the publish gate, so it
     * sets up the state the real workflow would have reached by this point instead of
     * asserting on a programme no admin could have prescribed.
     */
    `INSERT INTO programmes (organization_id, kind, name, duration_weeks, published_at)
     VALUES ($1, 'YOGA', 'Foundation', 2, now()) RETURNING id`,
    [org.id],
  );

  // Week 1 day 1, week 1 day 3, week 2 day 1.
  for (const [week, day, seq] of [
    [1, 1, 0],
    [1, 3, 0],
    [2, 1, 0],
  ]) {
    await query(
      `INSERT INTO programme_items
         (organization_id, programme_id, week_number, day_of_week, sequence, yoga_exercise_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [org.id, programme.id, week, day, seq, exercise.id],
    );
  }

  return {
    orgId: org.id,
    customerId: customer.id,
    adminId: admin.id,
    programmeId: programme.id,
    exerciseId: exercise.id,
  };
}

describeIsolated("assignment snapshots (ADR-009)", () => {
  let f: Fixture;

  beforeEach(async () => {
    await resetDatabase();
    f = await seed();
  });

  it("copies the template's items onto the assignment", async () => {
    const assignment = await createAssignmentFromProgramme({
      organizationId: f.orgId,
      customerId: f.customerId,
      assignedBy: f.adminId,
      programmeId: f.programmeId,
      startsOn: "2026-09-01",
    });

    const items = await query<{ title: string; instructions: string }>(
      `SELECT title, instructions FROM assignment_items WHERE assignment_id = $1`,
      [assignment.id],
    );

    expect(items).toHaveLength(3);
    expect(items[0].title).toBe("Surya Namaskar");
    expect(items[0].instructions).toBe("Twelve rounds, slowly.");
  });

  it("records provenance without depending on it", async () => {
    const assignment = await createAssignmentFromProgramme({
      organizationId: f.orgId,
      customerId: f.customerId,
      assignedBy: f.adminId,
      programmeId: f.programmeId,
      startsOn: "2026-09-01",
    });

    expect(assignment.sourceProgrammeId).toBe(f.programmeId);
    expect(assignment.sourceVersion).toBe(1);
    expect(assignment.name).toBe("Foundation");
  });

  /**
   * THE TEST THIS FILE EXISTS FOR.
   *
   * With a live reference, editing the template would change what the customer was told
   * to do — retroactively, including for days already scored.
   */
  it("does not change an existing plan when the template is edited afterwards", async () => {
    const assignment = await createAssignmentFromProgramme({
      organizationId: f.orgId,
      customerId: f.customerId,
      assignedBy: f.adminId,
      programmeId: f.programmeId,
      startsOn: "2026-09-01",
    });

    await query(
      `UPDATE yoga_exercises
          SET name = 'Surya Namaskar (revised)',
              instructions = 'Twenty rounds, quickly.'
        WHERE id = $1`,
      [f.exerciseId],
    );

    const items = await query<{ title: string; instructions: string }>(
      `SELECT title, instructions FROM assignment_items WHERE assignment_id = $1`,
      [assignment.id],
    );

    expect(items[0].title).toBe("Surya Namaskar");
    expect(items[0].instructions).toBe("Twelve rounds, slowly.");
  });

  it("survives the source exercise being deleted entirely", async () => {
    const assignment = await createAssignmentFromProgramme({
      organizationId: f.orgId,
      customerId: f.customerId,
      assignedBy: f.adminId,
      programmeId: f.programmeId,
      startsOn: "2026-09-01",
    });

    // programme_items has ON DELETE RESTRICT, so the template rows go first — which is
    // what a consultant retiring an exercise would do.
    await query(`DELETE FROM programme_items WHERE programme_id = $1`, [f.programmeId]);
    await query(`DELETE FROM yoga_exercises WHERE id = $1`, [f.exerciseId]);

    const items = await query<{ title: string; source_yoga_exercise_id: string | null }>(
      `SELECT title, source_yoga_exercise_id FROM assignment_items WHERE assignment_id = $1`,
      [assignment.id],
    );

    expect(items).toHaveLength(3);
    expect(items[0].title).toBe("Surya Namaskar");
    // Provenance is nulled by ON DELETE SET NULL; the plan itself is unharmed.
    expect(items[0].source_yoga_exercise_id).toBeNull();
  });

  it("refuses a programme belonging to another organization", async () => {
    const other = await createOrganization({ name: "Other", slug: "other" });

    await expect(
      createAssignmentFromProgramme({
        organizationId: other.id,
        customerId: f.customerId,
        assignedBy: null,
        programmeId: f.programmeId,
        startsOn: "2026-09-01",
      }),
    ).rejects.toThrow(/not found/i);
  });
});

describeIsolated("schedule materialisation", () => {
  let f: Fixture;

  beforeEach(async () => {
    await resetDatabase();
    f = await seed();
  });

  async function assign(startsOn = "2026-09-01") {
    return createAssignmentFromProgramme({
      organizationId: f.orgId,
      customerId: f.customerId,
      assignedBy: f.adminId,
      programmeId: f.programmeId,
      startsOn,
    });
  }

  it("creates one activity per item, dated from the start day", async () => {
    const assignment = await assign("2026-09-01");
    const { activitiesCreated } = await activateAssignment(f.orgId, assignment.id);

    expect(activitiesCreated).toBe(3);

    // The DATE is formatted by PostgreSQL, deliberately. node-postgres parses a DATE
    // into a JS Date at LOCAL midnight, so `.toISOString()` shifts it — east of
    // Greenwich, 2026-09-01 reads back as 2026-08-31 and the whole schedule looks
    // off by one. Letting the database format it keeps JS timezone handling out of
    // the assertion entirely. `formatDateColumn` exists for code that cannot do this.
    const activities = await query<{ d: string; status: string }>(
      `SELECT to_char(scheduled_for, 'YYYY-MM-DD') AS d, status
         FROM daily_activities
        WHERE assignment_id = $1 ORDER BY scheduled_for`,
      [assignment.id],
    );

    // Week 1 day 1 → the start day; week 1 day 3 → +2; week 2 day 1 → +7.
    expect(activities.map((a) => a.d)).toEqual([
      "2026-09-01",
      "2026-09-03",
      "2026-09-08",
    ]);
    expect(activities.every((a) => a.status === "PENDING")).toBe(true);
  });

  // Re-running must fill gaps, never double a day — a duplicate halves adherence.
  it("is idempotent when activated twice", async () => {
    const assignment = await assign();

    const first = await activateAssignment(f.orgId, assignment.id);
    const second = await activateAssignment(f.orgId, assignment.id);

    expect(first.activitiesCreated).toBe(3);
    expect(second.activitiesCreated).toBe(0);

    const [{ count }] = await query<{ count: string }>(
      `SELECT count(*)::text AS count FROM daily_activities WHERE assignment_id = $1`,
      [assignment.id],
    );
    expect(Number(count)).toBe(3);
  });

  it("does not reset a completed activity on re-activation", async () => {
    const assignment = await assign();
    await activateAssignment(f.orgId, assignment.id);

    await query(
      `UPDATE daily_activities SET status = 'COMPLETED', completed_at = now()
        WHERE assignment_id = $1 AND scheduled_for = '2026-09-01'`,
      [assignment.id],
    );

    await activateAssignment(f.orgId, assignment.id);

    const [row] = await query<{ status: string }>(
      `SELECT status FROM daily_activities
        WHERE assignment_id = $1 AND scheduled_for = '2026-09-01'`,
      [assignment.id],
    );
    expect(row.status).toBe("COMPLETED");
  });

  /**
   * docs/METRICS.md: a paused plan schedules nothing, so a customer on agreed holiday
   * cannot return to a wall of failures they were never given a chance to avoid.
   */
  it("removes future pending activities when paused, and keeps the past", async () => {
    const assignment = await assign("2026-09-01");
    await activateAssignment(f.orgId, assignment.id);

    // Backdate one activity and complete it, so there is a past to preserve.
    await query(
      `UPDATE daily_activities
          SET scheduled_for = current_date - 1, status = 'COMPLETED', completed_at = now()
        WHERE assignment_id = $1 AND scheduled_for = '2026-09-01'`,
      [assignment.id],
    );

    await pauseAssignment(f.orgId, assignment.id);

    const remaining = await query<{ status: string }>(
      `SELECT status FROM daily_activities WHERE assignment_id = $1`,
      [assignment.id],
    );

    expect(remaining).toHaveLength(1);
    expect(remaining[0].status).toBe("COMPLETED");

    const [assignmentRow] = await listAssignmentsForCustomer(f.orgId, f.customerId);
    expect(assignmentRow.status).toBe("PAUSED");
  });

  it("scopes activation to the organization", async () => {
    const other = await createOrganization({ name: "Other", slug: "other-2" });
    const assignment = await assign();

    await expect(activateAssignment(other.id, assignment.id)).rejects.toThrow(/not found/i);
  });
});
