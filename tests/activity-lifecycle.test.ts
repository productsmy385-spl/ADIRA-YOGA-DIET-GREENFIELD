import {beforeEach, expect, it} from "vitest";

import { query } from "@/server/db/pool";
import {
  completeActivity,
  listActivitiesForDate,
  listStatusesInRange,
  organizationToday,
  skipActivity,
  startActivity,
  sweepMissedActivities,
} from "@/server/repositories/activities";
import {
  activateAssignment,
  createAssignmentFromProgramme,
  pauseAssignment,
} from "@/server/repositories/assignments";
import { createOrganization } from "@/server/repositories/organizations";
import { createUser } from "@/server/repositories/users";
import { reportedCompletionRate, tally } from "@/server/services/metrics";

import {describeIsolated, resetDatabase} from "./helpers/sql-db";


interface Fixture {
  orgId: string;
  otherOrgId: string;
  customerId: string;
  otherCustomerId: string;
  assignmentId: string;
  today: string;
}

/** Builds a one-week daily programme starting today, activated. */
async function seed(): Promise<Fixture> {
  const org = await createOrganization({ name: "Studio", slug: "studio" });
  const other = await createOrganization({ name: "Other", slug: "other" });

  const customer = await createUser({
    organizationId: org.id,
    email: "anita@studio.test",
    fullName: "Anita",
    role: "CUSTOMER",
    status: "ACTIVE",
  });

  const otherCustomer = await createUser({
    organizationId: other.id,
    email: "bob@other.test",
    fullName: "Bob",
    role: "CUSTOMER",
    status: "ACTIVE",
  });

  const [exercise] = await query<{ id: string }>(
    `INSERT INTO yoga_exercises (organization_id, name, instructions)
     VALUES ($1, 'Surya Namaskar', 'Twelve rounds.') RETURNING id`,
    [org.id],
  );

  const [programme] = await query<{ id: string }>(
    `INSERT INTO programmes (organization_id, kind, name, duration_weeks)
     VALUES ($1, 'YOGA', 'Foundation', 1) RETURNING id`,
    [org.id],
  );

  for (let day = 1; day <= 3; day += 1) {
    await query(
      `INSERT INTO programme_items
         (organization_id, programme_id, week_number, day_of_week, sequence, yoga_exercise_id)
       VALUES ($1, $2, 1, $3, 0, $4)`,
      [org.id, programme.id, day, exercise.id],
    );
  }

  const today = await organizationToday(org.id);

  const assignment = await createAssignmentFromProgramme({
    organizationId: org.id,
    customerId: customer.id,
    assignedBy: null,
    programmeId: programme.id,
    startsOn: today,
  });

  await activateAssignment(org.id, assignment.id);

  return {
    orgId: org.id,
    otherOrgId: other.id,
    customerId: customer.id,
    otherCustomerId: otherCustomer.id,
    assignmentId: assignment.id,
    today,
  };
}

describeIsolated("activity lifecycle", () => {
  let f: Fixture;

  beforeEach(async () => {
    await resetDatabase();
    f = await seed();
  });

  async function todayActivity() {
    const [activity] = await listActivitiesForDate(f.orgId, f.customerId, f.today);
    return activity;
  }

  it("shows the customer today's activities with their snapshotted content", async () => {
    const activities = await listActivitiesForDate(f.orgId, f.customerId, f.today);

    expect(activities).toHaveLength(1);
    expect(activities[0].title).toBe("Surya Namaskar");
    expect(activities[0].instructions).toBe("Twelve rounds.");
    expect(activities[0].status).toBe("PENDING");
    expect(activities[0].scheduledFor).toBe(f.today);
  });

  it("moves an activity through start and completion", async () => {
    const activity = await todayActivity();

    expect((await startActivity(f.orgId, f.customerId, activity.id)).ok).toBe(true);
    expect((await todayActivity()).status).toBe("STARTED");

    expect((await completeActivity(f.orgId, f.customerId, activity.id)).ok).toBe(true);

    const completed = await todayActivity();
    expect(completed.status).toBe("COMPLETED");
    expect(completed.completedAt).toBeInstanceOf(Date);
    expect(completed.startedAt).toBeInstanceOf(Date);
  });

  /**
   * USER-JOURNEYS J1: the phone will be in another room during practice. A completion
   * recorded hours later, without ever pressing start, is the normal case.
   */
  it("allows completing without starting first", async () => {
    const activity = await todayActivity();

    expect((await completeActivity(f.orgId, f.customerId, activity.id)).ok).toBe(true);

    const completed = await todayActivity();
    expect(completed.status).toBe("COMPLETED");
    // started_at is backfilled so the record is coherent rather than half-null.
    expect(completed.startedAt).toBeInstanceOf(Date);
  });

  it("does not re-complete an already completed activity", async () => {
    const activity = await todayActivity();
    await completeActivity(f.orgId, f.customerId, activity.id);

    const first = (await todayActivity()).completedAt;
    const second = await completeActivity(f.orgId, f.customerId, activity.id);

    expect(second.ok).toBe(false);
    expect((await todayActivity()).completedAt).toEqual(first);
  });

  it("records a skip, which counts against adherence", async () => {
    const activity = await todayActivity();
    expect((await skipActivity(f.orgId, f.customerId, activity.id, "unwell")).ok).toBe(true);
    expect((await todayActivity()).status).toBe("SKIPPED");
  });

  // ------------------------------------------------------------------
  // Ownership — the IDOR shape for this endpoint
  // ------------------------------------------------------------------

  it("refuses to advance an activity belonging to another customer", async () => {
    const activity = await todayActivity();

    expect(
      (await completeActivity(f.orgId, f.otherCustomerId, activity.id)).ok,
    ).toBe(false);
    expect((await startActivity(f.orgId, f.otherCustomerId, activity.id)).ok).toBe(false);
    expect((await todayActivity()).status).toBe("PENDING");
  });

  it("refuses to advance an activity under another organization", async () => {
    const activity = await todayActivity();

    expect(
      (await completeActivity(f.otherOrgId, f.customerId, activity.id)).ok,
    ).toBe(false);
    expect((await todayActivity()).status).toBe("PENDING");
  });

  it("never lists another customer's activities", async () => {
    expect(await listActivitiesForDate(f.orgId, f.otherCustomerId, f.today)).toEqual([]);
    expect(await listActivitiesForDate(f.otherOrgId, f.customerId, f.today)).toEqual([]);
  });

  // ------------------------------------------------------------------
  // The nightly sweep
  // ------------------------------------------------------------------

  it("sweeps a past-due pending activity to MISSED", async () => {
    await query(
      `UPDATE daily_activities SET scheduled_for = current_date - 2
        WHERE assignment_id = $1 AND scheduled_for = $2::date`,
      [f.assignmentId, f.today],
    );

    expect(await sweepMissedActivities()).toBeGreaterThanOrEqual(1);

    const [row] = await query<{ status: string }>(
      `SELECT status FROM daily_activities WHERE assignment_id = $1 AND scheduled_for = current_date - 2`,
      [f.assignmentId],
    );
    expect(row.status).toBe("MISSED");
  });

  it("does not sweep today's activity", async () => {
    await sweepMissedActivities();
    expect((await todayActivity()).status).toBe("PENDING");
  });

  it("does not sweep a completed activity back to missed", async () => {
    const activity = await todayActivity();
    await completeActivity(f.orgId, f.customerId, activity.id);

    await query(
      `UPDATE daily_activities SET scheduled_for = current_date - 3 WHERE id = $1`,
      [activity.id],
    );
    await sweepMissedActivities();

    const [row] = await query<{ status: string }>(
      `SELECT status FROM daily_activities WHERE id = $1`,
      [activity.id],
    );
    expect(row.status).toBe("COMPLETED");
  });

  /**
   * The rule that makes pausing meaningful. Without the ACTIVE join in the sweep,
   * pausing would stop new activities appearing while existing ones quietly rotted into
   * misses — the wall of failure docs/METRICS.md exists to prevent.
   */
  it("does not sweep activities belonging to a paused assignment", async () => {
    // Backdate first, so there is something the sweep would otherwise catch, then pause.
    await query(
      `UPDATE daily_activities SET scheduled_for = current_date - 2
        WHERE assignment_id = $1 AND scheduled_for = $2::date`,
      [f.assignmentId, f.today],
    );
    await pauseAssignment(f.orgId, f.assignmentId);

    await sweepMissedActivities();

    const rows = await query<{ status: string }>(
      `SELECT status FROM daily_activities WHERE assignment_id = $1`,
      [f.assignmentId],
    );
    expect(rows.every((r) => r.status !== "MISSED")).toBe(true);
  });

  // ------------------------------------------------------------------
  // Feeding the metrics
  // ------------------------------------------------------------------

  it("produces counts the metric functions can score", async () => {
    const activity = await todayActivity();
    await completeActivity(f.orgId, f.customerId, activity.id);

    const statuses = await listStatusesInRange(
      f.orgId,
      f.customerId,
      f.today,
      f.today,
    );

    const counts = tally(statuses);
    expect(counts.completed).toBe(1);
    expect(reportedCompletionRate(counts)).toBe(1);
  });

  // The rule that a dashboard must not render 0% for someone given nothing to do.
  it("reports no adherence, rather than zero, for a day with nothing scheduled", async () => {
    const statuses = await listStatusesInRange(
      f.orgId,
      f.customerId,
      "2020-01-01",
      "2020-01-07",
    );

    expect(statuses).toEqual([]);
    expect(reportedCompletionRate(tally(statuses))).toBeNull();
  });
});
