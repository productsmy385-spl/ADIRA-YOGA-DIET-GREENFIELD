import { beforeEach, expect, it } from "vitest";

import { canManageOrganization } from "@/server/authorization/permissions";
import { resolveMemberAccess } from "@/server/authorization/member-access";
import type { TenantActor } from "@/server/authorization/roles";
import { query } from "@/server/db/pool";
import {
  completeActivity,
  listActivitiesForDate,
  organizationToday,
  startActivity,
} from "@/server/repositories/activities";
import {
  activateAssignment,
  createAssignmentFromProgramme,
  listAssignmentsForCustomer,
} from "@/server/repositories/assignments";
import { upsertCheckIn, listCheckInsInRange } from "@/server/repositories/checkins";
import { createMeal, createYogaExercise } from "@/server/repositories/library";
import { createAssignment } from "@/server/repositories/members";
import { createOrganization } from "@/server/repositories/organizations";
import {
  addProgrammeItem,
  createProgramme,
  listProgrammeItems,
  publishProgramme,
} from "@/server/repositories/programmes";
import { createUser } from "@/server/repositories/users";
import { completionPercent, tally } from "@/server/services/metrics";

import { describeIsolated, resetDatabase } from "./helpers/sql-db";

/**
 * The whole product, once, against a real database.
 *
 * Every other suite proves one layer. This one proves they connect — that an admin can
 * build a programme, publish it, prescribe it, and that the member then has real rows to
 * complete, which the admin can then see and nobody else can.
 *
 * It exists because each piece passing in isolation is not evidence that the chain works.
 * The assignment snapshot, the schedule generation, the activity lifecycle and the
 * authorization gate were all built separately and all passed their own tests while the
 * product could not actually deliver a plan to anybody.
 *
 * EVERY ASSERTION TRACES TO POSTGRESQL. No mocked repositories, no fixtures asserting
 * against themselves — where a claim matters, the row is read back.
 */

interface World {
  orgId: string;
  otherOrgId: string;
  adminId: string;
  otherAdminId: string;
  foreignAdminId: string;
  memberId: string;
  otherMemberId: string;
  foreignMemberId: string;
  yogaProgrammeId: string;
  dietProgrammeId: string;
  exerciseId: string;
  mealId: string;
  today: string;
}

const admin = (userId: string, organizationId: string): TenantActor => ({
  domain: "TENANT",
  userId,
  organizationId,
  role: "ADMIN",
});

const member = (userId: string, organizationId: string): TenantActor => ({
  domain: "TENANT",
  userId,
  organizationId,
  role: "USER",
});

describeIsolated("the complete product workflow", () => {
  let w: World;

  beforeEach(async () => {
    await resetDatabase();

    const org = await createOrganization({ name: "Adira E2E", slug: "adira-e2e" });
    const other = await createOrganization({ name: "Other Studio", slug: "other-e2e" });

    const mk = async (orgId: string, role: "ADMIN" | "CUSTOMER", email: string) =>
      (
        await createUser({
          organizationId: orgId,
          email,
          fullName: email.split("@")[0],
          role,
          status: "ACTIVE",
        })
      ).id;

    w = {
      orgId: org.id,
      otherOrgId: other.id,
      adminId: await mk(org.id, "ADMIN", "admin@e2e.test"),
      otherAdminId: await mk(org.id, "ADMIN", "admin2@e2e.test"),
      foreignAdminId: await mk(other.id, "ADMIN", "admin@other-e2e.test"),
      memberId: await mk(org.id, "CUSTOMER", "anita@e2e.test"),
      otherMemberId: await mk(org.id, "CUSTOMER", "bhavna@e2e.test"),
      foreignMemberId: await mk(other.id, "CUSTOMER", "dev@other-e2e.test"),
      yogaProgrammeId: "",
      dietProgrammeId: "",
      exerciseId: "",
      mealId: "",
      today: "",
    };

    w.today = await organizationToday(w.orgId);
  });

  it("runs admin → library → programme → publish → assign → member → progress → monitoring", async () => {
    // ---- 2. Admin creates a yoga exercise -------------------------------
    const exercise = await createYogaExercise(w.orgId, {
      name: "Mountain Pose",
      instructions: "Stand tall, weight even through both feet.",
      defaultDurationSeconds: 300,
      difficulty: "BEGINNER",
    });
    w.exerciseId = exercise.id;
    expect(exercise.id).toBeTruthy();

    // ---- 3. Admin creates a diet meal ------------------------------------
    const meal = await createMeal(w.orgId, {
      name: "Warm lemon water",
      quantity: "one glass",
      slot: "BREAKFAST",
    });
    w.mealId = meal.id;

    // ---- 4/5. Programme, then items --------------------------------------
    const yoga = await createProgramme(w.orgId, {
      kind: "YOGA",
      name: "Foundation Yoga",
      durationWeeks: 1,
      difficulty: "BEGINNER",
    });
    w.yogaProgrammeId = yoga.id;

    // Seven days, so whichever weekday `today` falls on has an activity. Without this the
    // test passes or fails depending on the day it runs, which is the worst kind of flake.
    for (let day = 1; day <= 7; day += 1) {
      await addProgrammeItem(w.orgId, yoga.id, {
        weekNumber: 1,
        dayOfWeek: day,
        sequence: 0,
        yogaExerciseId: exercise.id,
        durationSeconds: 300,
      });
    }

    const items = await listProgrammeItems(w.orgId, yoga.id);
    expect(items).toHaveLength(7);

    // ---- 6. Publishing refuses an empty programme, then succeeds ---------
    const empty = await createProgramme(w.orgId, {
      kind: "YOGA",
      name: "Empty Programme",
      durationWeeks: 1,
    });
    expect(await publishProgramme(w.orgId, empty.id)).toEqual({
      ok: false,
      reason: "EMPTY",
    });

    expect(await publishProgramme(w.orgId, yoga.id)).toEqual({ ok: true });

    // Read back from PostgreSQL rather than trusting the return value.
    const publishedRow = await query<{ published_at: Date | null }>(
      `SELECT published_at FROM programmes WHERE id = $1`,
      [yoga.id],
    );
    expect(publishedRow[0].published_at).not.toBeNull();

    // ---- 7. Diet programme ----------------------------------------------
    const diet = await createProgramme(w.orgId, {
      kind: "DIET",
      name: "Foundation Diet",
      durationWeeks: 1,
    });
    w.dietProgrammeId = diet.id;

    for (let day = 1; day <= 7; day += 1) {
      await addProgrammeItem(w.orgId, diet.id, {
        weekNumber: 1,
        dayOfWeek: day,
        sequence: 0,
        mealId: meal.id,
        slot: "BREAKFAST",
      });
    }
    expect(await publishProgramme(w.orgId, diet.id)).toEqual({ ok: true });

    // ---- Caseload: administrative, and required before prescribing -------
    // A new member has no assignment, so this step MUST be administrative or the product
    // deadlocks — nobody could ever be given a first plan.
    expect(canManageOrganization(admin(w.adminId, w.orgId))).toEqual({ allowed: true });
    await createAssignment(w.orgId, w.adminId, w.memberId);

    expect(
      (await resolveMemberAccess(admin(w.adminId, w.orgId), w.memberId)).decision,
    ).toEqual({ allowed: true });

    // ---- 8/9. Assign both programmes -------------------------------------
    const yogaAssignment = await createAssignmentFromProgramme({
      organizationId: w.orgId,
      customerId: w.memberId,
      assignedBy: w.adminId,
      programmeId: yoga.id,
      startsOn: w.today,
    });

    const dietAssignment = await createAssignmentFromProgramme({
      organizationId: w.orgId,
      customerId: w.memberId,
      assignedBy: w.adminId,
      programmeId: diet.id,
      startsOn: w.today,
    });

    const yogaGenerated = await activateAssignment(w.orgId, yogaAssignment.id);
    const dietGenerated = await activateAssignment(w.orgId, dietAssignment.id);

    expect(yogaGenerated.activitiesCreated).toBeGreaterThan(0);
    expect(dietGenerated.activitiesCreated).toBeGreaterThan(0);

    // ---- 10. The snapshot is a COPY, not a reference ----------------------
    const snapshotted = await query<{ n: string }>(
      `SELECT count(*)::text AS n FROM assignment_items WHERE assignment_id = $1`,
      [yogaAssignment.id],
    );
    expect(Number(snapshotted[0].n)).toBe(7);

    // Rename the template. The member's plan must not follow it.
    await query(`UPDATE programmes SET name = 'RENAMED AFTER ASSIGNMENT' WHERE id = $1`, [
      yoga.id,
    ]);

    // `assignments.name` is the snapshotted title, `source_programme_id` only provenance.
    const stillNamed = await query<{ name: string; source_version: number }>(
      `SELECT name, source_version FROM assignments WHERE id = $1`,
      [yogaAssignment.id],
    );
    expect(stillNamed[0].name).toBe("Foundation Yoga");

    // Provenance, not a fixed number: `version` is bumped on every edit, so after seven
    // item additions it is 8. What matters is that the assignment recorded WHICH version
    // it copied, so "which Foundation Yoga was Anita given" stays answerable after the
    // template moves on.
    expect(stillNamed[0].source_version).toBeGreaterThan(0);

    // ---- 12/13/14. The member has a real day ------------------------------
    const todaysActivities = await listActivitiesForDate(w.orgId, w.memberId, w.today);
    expect(todaysActivities.length).toBeGreaterThanOrEqual(2);
    expect(todaysActivities.some((a) => a.kind === "YOGA")).toBe(true);
    expect(todaysActivities.some((a) => a.kind === "DIET")).toBe(true);

    // ---- 15/16. Start, then complete --------------------------------------
    const firstYoga = todaysActivities.find((a) => a.kind === "YOGA")!;
    await startActivity(w.orgId, w.memberId, firstYoga.id);

    const afterStart = await query<{ status: string; started_at: Date | null }>(
      `SELECT status, started_at FROM daily_activities WHERE id = $1`,
      [firstYoga.id],
    );
    expect(afterStart[0].status).toBe("STARTED");
    expect(afterStart[0].started_at).not.toBeNull();

    await completeActivity(w.orgId, w.memberId, firstYoga.id);

    const afterComplete = await query<{ status: string; completed_at: Date | null }>(
      `SELECT status, completed_at FROM daily_activities WHERE id = $1`,
      [firstYoga.id],
    );
    expect(afterComplete[0].status).toBe("COMPLETED");
    expect(afterComplete[0].completed_at).not.toBeNull();

    // ---- 17. Diet completion ----------------------------------------------
    const firstDiet = todaysActivities.find((a) => a.kind === "DIET")!;
    await completeActivity(w.orgId, w.memberId, firstDiet.id);

    const dietDone = await query<{ status: string }>(
      `SELECT status FROM daily_activities WHERE id = $1`,
      [firstDiet.id],
    );
    expect(dietDone[0].status).toBe("COMPLETED");

    // ---- 18. Check-in ------------------------------------------------------
    await upsertCheckIn(w.orgId, w.memberId, w.today, {
      mood: 4,
      waterGlasses: 6,
      notes: "Felt steadier than yesterday.",
    });

    const checkIns = await listCheckInsInRange(w.orgId, w.memberId, w.today, w.today);
    expect(checkIns).toHaveLength(1);
    expect(checkIns[0].mood).toBe(4);

    // ---- 19/20. Progress reflects what was actually completed --------------
    const statuses = (await listActivitiesForDate(w.orgId, w.memberId, w.today)).map(
      (a) => a.status,
    );
    const counts = tally(statuses);
    expect(counts.completed).toBe(2);
    expect(completionPercent(counts)).not.toBeNull();

    // ---- 24. The assigned admin sees the member ----------------------------
    const assignments = await listAssignmentsForCustomer(w.orgId, w.memberId);
    expect(assignments.length).toBeGreaterThanOrEqual(2);

    expect(
      (await resolveMemberAccess(admin(w.adminId, w.orgId), w.memberId)).decision,
    ).toEqual({ allowed: true });

    // ---- 25. An UNASSIGNED admin in the same organisation cannot ------------
    // The heart of ADR-013: administering the organisation is not reading a practice.
    expect(canManageOrganization(admin(w.otherAdminId, w.orgId))).toEqual({ allowed: true });
    expect(
      (await resolveMemberAccess(admin(w.otherAdminId, w.orgId), w.memberId)).decision,
    ).toEqual({ allowed: false, reason: "NOT_ASSIGNED" });

    // ---- 26. Cross-tenant is refused before assignment is even considered ---
    expect(
      (await resolveMemberAccess(admin(w.foreignAdminId, w.otherOrgId), w.memberId))
        .decision,
    ).toMatchObject({ allowed: false });

    // A member reads themselves and nobody else.
    expect(
      (await resolveMemberAccess(member(w.memberId, w.orgId), w.memberId)).decision,
    ).toEqual({ allowed: true });
    expect(
      (await resolveMemberAccess(member(w.memberId, w.orgId), w.otherMemberId)).decision,
    ).toEqual({ allowed: false, reason: "NOT_ASSIGNED" });
  });

  /**
   * The other member got nothing, and that must be visible in the database rather than
   * merely absent from a screen.
   */
  it("schedules nothing for a member who was never assigned a programme", async () => {
    const yoga = await createProgramme(w.orgId, {
      kind: "YOGA",
      name: "Solo Programme",
      durationWeeks: 1,
    });
    const exercise = await createYogaExercise(w.orgId, { name: "Tree Pose" });
    await addProgrammeItem(w.orgId, yoga.id, {
      weekNumber: 1,
      dayOfWeek: 1,
      sequence: 0,
      yogaExerciseId: exercise.id,
    });
    await publishProgramme(w.orgId, yoga.id);

    await createAssignment(w.orgId, w.adminId, w.memberId);
    const assignment = await createAssignmentFromProgramme({
      organizationId: w.orgId,
      customerId: w.memberId,
      assignedBy: w.adminId,
      programmeId: yoga.id,
      startsOn: w.today,
    });
    await activateAssignment(w.orgId, assignment.id);

    const otherMembersDay = await listActivitiesForDate(w.orgId, w.otherMemberId, w.today);
    expect(otherMembersDay).toEqual([]);

    const rows = await query<{ n: string }>(
      `SELECT count(*)::text AS n FROM daily_activities WHERE customer_id = $1`,
      [w.otherMemberId],
    );
    expect(Number(rows[0].n)).toBe(0);
  });

  /**
   * A draft is not assignable. The rule lives in the action rather than the repository, so
   * this asserts the state the action checks — a programme with items but no publish stamp.
   */
  it("leaves an unpublished programme in DRAFT so the action can refuse it", async () => {
    const draft = await createProgramme(w.orgId, {
      kind: "YOGA",
      name: "Draft Programme",
      durationWeeks: 1,
    });
    const exercise = await createYogaExercise(w.orgId, { name: "Warrior" });
    await addProgrammeItem(w.orgId, draft.id, {
      weekNumber: 1,
      dayOfWeek: 1,
      sequence: 0,
      yogaExerciseId: exercise.id,
    });

    const row = await query<{ published_at: Date | null; archived_at: Date | null }>(
      `SELECT published_at, archived_at FROM programmes WHERE id = $1`,
      [draft.id],
    );
    expect(row[0].published_at).toBeNull();
    expect(row[0].archived_at).toBeNull();
  });
});
