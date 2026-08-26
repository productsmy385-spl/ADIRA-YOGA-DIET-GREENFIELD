import { beforeEach, expect, it } from "vitest";

import { resolveMemberAccess } from "@/server/authorization/member-access";
import {
  canAccessMemberData,
  canAssignRole,
  canManageOrganization,
  canManageProgrammes,
  canPrescribe,
} from "@/server/authorization/permissions";
import type { TenantActor } from "@/server/authorization/roles";
import { query } from "@/server/db/pool";
import {
  completeActivity,
  listActivitiesForDate,
  organizationToday,
  skipActivity,
  startActivity,
} from "@/server/repositories/activities";
import {
  activateAssignment,
  createAssignmentFromProgramme,
} from "@/server/repositories/assignments";
import { listCheckInsInRange, upsertCheckIn } from "@/server/repositories/checkins";
import { createMeal, createYogaExercise } from "@/server/repositories/library";
import { listCaseload } from "@/server/repositories/caseload";
import { createAssignment, listMembers } from "@/server/repositories/members";
import { createNotification, listNotifications } from "@/server/repositories/notifications";
import { createOrganization } from "@/server/repositories/organizations";
import {
  addProgrammeItem,
  createProgramme,
  publishProgramme,
} from "@/server/repositories/programmes";
import { createUser } from "@/server/repositories/users";
import { completionPercent, tally } from "@/server/services/metrics";

import { describeIsolated, resetDatabase } from "./helpers/sql-db";

/**
 * The FOUR-ROLE chain, end to end, against a real database.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THIS IS A SEPARATE FILE FROM `end-to-end-workflow.test.ts`
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * That suite proves the product works for an ADMIN, and it predates TRAINER and STAFF
 * entirely. Rewriting it to add two roles would risk the coverage it already carries —
 * snapshot semantics, schedule generation, report freezing — for a concern it was not
 * written about.
 *
 * So this file proves only what that one cannot reach: that the ROLE LADDER works. Whose
 * account may create whose, who may author a programme, who may prescribe it, who may
 * read the practice that results, and — the half that matters most — who may not.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * EVERY GATE IS THE REAL ONE
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The permission functions asserted here are the same ones the server actions call. This
 * is not a parallel model of the rules: `canAssignRole` gating account creation below is
 * literally the check inside `addMemberAction`, and `resolveMemberAccess` is the gate
 * every member-data page passes through.
 *
 * Where a claim is about DATA rather than a decision, the row is read back from
 * PostgreSQL. A test that asserts against its own fixtures proves nothing about scoping.
 */

interface World {
  orgA: string;
  orgB: string;
  adminA: string;
  trainerA: string;
  staffA: string;
  customerAssigned: string;
  customerUnassigned: string;
  adminB: string;
  customerB: string;
  today: string;
}

function actor(userId: string, organizationId: string, role: TenantActor["role"]): TenantActor {
  return { domain: "TENANT", userId, organizationId, role };
}

async function seed(): Promise<World> {
  /*
   * STEP 1 — the platform operator provisions a tenant.
   *
   * `createOrganization` is what `createOrganizationAction` calls after
   * `requirePlatformSession`. The platform domain has its own table and its own session
   * (ADR-001), so there is no tenant actor in scope here at all — which is the point:
   * a tenant cannot create its own organisation.
   */
  const a = await createOrganization({ name: "Studio A", slug: "studio-a" });
  const b = await createOrganization({ name: "Studio B", slug: "studio-b" });

  const mk = async (
    org: string,
    email: string,
    fullName: string,
    role: TenantActor["role"],
  ) => (await createUser({ organizationId: org, email, fullName, role, status: "ACTIVE" })).id;

  // STEP 2 — the platform operator provisions the tenant's first ADMIN. A tenant cannot
  // do this for itself: `canAssignRole(ADMIN, "ADMIN")` is refused by strict rank.
  const adminA = await mk(a.id, "admin@a.test", "Admin A", "ADMIN");
  const adminB = await mk(b.id, "admin@b.test", "Admin B", "ADMIN");

  // STEP 3 — the ADMIN builds their team and roll.
  const trainerA = await mk(a.id, "trainer@a.test", "Trainer A", "TRAINER");
  const staffA = await mk(a.id, "staff@a.test", "Staff A", "STAFF");
  const customerAssigned = await mk(a.id, "asha@a.test", "Asha", "USER");
  const customerUnassigned = await mk(a.id, "bala@a.test", "Bala", "USER");
  const customerB = await mk(b.id, "chetan@b.test", "Chetan", "USER");

  return {
    orgA: a.id,
    orgB: b.id,
    adminA,
    trainerA,
    staffA,
    customerAssigned,
    customerUnassigned,
    adminB,
    customerB,
    today: await organizationToday(a.id),
  };
}

describeIsolated("four-role acceptance", () => {
  let w: World;

  beforeEach(async () => {
    await resetDatabase();
    w = await seed();
  });

  /* ── the chain, in the order an organisation actually performs it ─────── */

  it("runs super-admin → org → admin → trainer → customer → plan → practice → monitoring", async () => {
    const admin = actor(w.adminA, w.orgA, "ADMIN");
    const trainer = actor(w.trainerA, w.orgA, "TRAINER");

    // ---- 4. The ADMIN may grant exactly the roles below their own ---------
    expect(canAssignRole(admin, "TRAINER").allowed).toBe(true);
    expect(canAssignRole(admin, "STAFF").allowed).toBe(true);
    expect(canAssignRole(admin, "USER").allowed).toBe(true);
    // ...and not their own, which is the escalation the rank rule exists to stop.
    expect(canAssignRole(admin, "ADMIN").allowed).toBe(false);

    // The team is administrable — a role the roster cannot list cannot be managed.
    const team = await listMembers(w.orgA, { kind: "STAFF" });
    expect(team.map((t) => t.role).sort()).toEqual(["ADMIN", "STAFF", "TRAINER"]);

    // ---- 5. The ADMIN puts the customer on the trainer's caseload ---------
    // Administrative, gated by `canManageOrganization`, and it MUST NOT require data
    // reach or the product deadlocks — nobody could ever be assigned a first member.
    expect(canManageOrganization(admin).allowed).toBe(true);
    await createAssignment(w.orgA, w.trainerA, w.customerAssigned);

    // ---- 6. The TRAINER authors the library and a programme --------------
    expect(canManageProgrammes(trainer).allowed).toBe(true);

    const pose = await createYogaExercise(w.orgA, {
      name: "Tadasana",
      instructions: "Stand tall, weight even.",
      defaultDurationSeconds: 300,
    });
    const meal = await createMeal(w.orgA, { name: "Oats and fruit" });

    const yoga = await createProgramme(w.orgA, {
      kind: "YOGA",
      name: "Morning Flow",
      durationWeeks: 1,
    });
    await addProgrammeItem(w.orgA, yoga.id, {
      weekNumber: 1,
      dayOfWeek: 1,
      sequence: 0,
      yogaExerciseId: pose.id,
    });
    await addProgrammeItem(w.orgA, yoga.id, {
      weekNumber: 1,
      dayOfWeek: 1,
      sequence: 1,
      yogaExerciseId: pose.id,
    });

    const diet = await createProgramme(w.orgA, {
      kind: "DIET",
      name: "Balanced Week",
      durationWeeks: 1,
    });
    await addProgrammeItem(w.orgA, diet.id, {
      weekNumber: 1,
      dayOfWeek: 1,
      sequence: 0,
      mealId: meal.id,
    });

    // ---- 7. Publishing is the deliberate act that makes a plan assignable --
    expect(await publishProgramme(w.orgA, yoga.id)).toEqual({ ok: true });
    expect(await publishProgramme(w.orgA, diet.id)).toEqual({ ok: true });

    // ---- 8. The TRAINER prescribes — role capability AND member reach ------
    expect(canPrescribe(trainer).allowed).toBe(true);
    expect(
      (await resolveMemberAccess(trainer, w.customerAssigned)).decision.allowed,
    ).toBe(true);

    for (const programmeId of [yoga.id, diet.id]) {
      const assignment = await createAssignmentFromProgramme({
        organizationId: w.orgA,
        customerId: w.customerAssigned,
        assignedBy: w.trainerA,
        programmeId,
        startsOn: w.today,
      });
      await activateAssignment(w.orgA, assignment.id);
    }

    // ---- 9. The CUSTOMER has real rows, generated from the snapshot -------
    const scheduled = await listActivitiesForDate(w.orgA, w.customerAssigned, w.today);
    expect(scheduled.length).toBe(3);
    expect(scheduled.every((a) => a.status === "PENDING")).toBe(true);

    // ---- 10. Start → complete → skip, the full lifecycle ------------------
    expect(await startActivity(w.orgA, w.customerAssigned, scheduled[0].id)).toEqual({
      ok: true,
    });
    expect(await completeActivity(w.orgA, w.customerAssigned, scheduled[0].id)).toEqual({
      ok: true,
    });
    expect(await completeActivity(w.orgA, w.customerAssigned, scheduled[1].id)).toEqual({
      ok: true,
    });
    expect(
      await skipActivity(w.orgA, w.customerAssigned, scheduled[2].id, "away today"),
    ).toEqual({ ok: true });

    // Timestamps persisted, not merely a status column.
    const [row] = await query<{ started_at: Date | null; completed_at: Date | null }>(
      `SELECT started_at, completed_at FROM daily_activities WHERE id = $1`,
      [scheduled[0].id],
    );
    expect(row.started_at).not.toBeNull();
    expect(row.completed_at).not.toBeNull();

    // ---- 11. Check-in -----------------------------------------------------
    await upsertCheckIn(w.orgA, w.customerAssigned, w.today, { mood: 4, sleepQuality: 3 });
    const checkIns = await listCheckInsInRange(w.orgA, w.customerAssigned, w.today, w.today);
    expect(checkIns).toHaveLength(1);
    expect(checkIns[0].mood).toBe(4);

    // ---- 12. Progress reflects what actually happened ---------------------
    const counts = tally(
      (await listActivitiesForDate(w.orgA, w.customerAssigned, w.today)).map((a) => a.status),
    );
    expect(counts.completed).toBe(2);
    expect(counts.skipped).toBe(1);
    expect(completionPercent(counts)).not.toBeNull();

    // ---- 13. The TRAINER monitors their own caseload ----------------------
    const caseload = await listCaseload(trainer);
    expect(caseload.map((c) => c.customerId)).toEqual([w.customerAssigned]);

    // ---- 14. A notification reaches the customer --------------------------
    const note = await createNotification({
      organizationId: w.orgA,
      recipientId: w.customerAssigned,
      senderId: w.trainerA,
      kind: "CONSULTANT_MESSAGE",
      title: "Nice work this week",
      body: "Keep the evening session going.",
      link: "/notifications",
    });
    const inbox = await listNotifications(w.orgA, w.customerAssigned, 10);
    expect(inbox.map((n) => n.id)).toContain(note.id);
    // ...and reaches nobody else.
    const otherInbox = await listNotifications(w.orgA, w.customerUnassigned, 10);
    expect(otherInbox).toHaveLength(0);
  }, 120_000);

  /* ── the negative half ────────────────────────────────────────────────── */

  /**
   * A TRAINER creates no accounts — and the reason is worth stating exactly, because the
   * obvious assertion is wrong and looks like a hole in review.
   *
   * `canAssignRole` alone PERMITS a trainer to grant STAFF and USER: it is a pure rank
   * comparison, TRAINER is 15, STAFF is 12, and 15 strictly outranks 12. Asserting that
   * function in isolation and expecting a refusal fails — this test did, first time.
   *
   * Account creation is not that function. It is a COMPOSITION, in `addMemberAction` and
   * `api/members/import`, and both ask `canManageOrganization` FIRST:
   *
   *     canManageOrganization(actor)   → ADMIN only  → a TRAINER stops here
   *     canAssignRole(actor, role)     → strict rank → never reached by a TRAINER
   *
   * So the rank rule's permissiveness is unreachable, and the product behaviour is the
   * required one: a trainer cannot create anybody. Asserting the composition rather than
   * the component is the difference between testing the gate and testing a hinge.
   */
  it("refuses a TRAINER every organisation-management capability", async () => {
    const trainer = actor(w.trainerA, w.orgA, "TRAINER");

    // Authors plans, administers nothing. This is the whole reason the role exists —
    // before it, every ADMIN could administer the organisation and there was no way to
    // describe somebody who only works a caseload.
    expect(canManageOrganization(trainer).allowed).toBe(false);

    // The composed gate, as the actions perform it. Every role a trainer might try to
    // grant is refused, because the first check already stopped them.
    for (const role of ["USER", "STAFF", "TRAINER", "ADMIN"] as const) {
      const permitted =
        canManageOrganization(trainer).allowed && canAssignRole(trainer, role).allowed;
      expect(permitted).toBe(false);
    }

    // SUPER_ADMIN is refused for a different reason entirely, and the reason matters: it
    // is not merely senior, it is a different identity domain with no rung on this
    // ladder. No rank could ever satisfy it.
    expect(canAssignRole(trainer, "SUPER_ADMIN")).toEqual({
      allowed: false,
      reason: "UNGRANTABLE_ROLE",
    });
  });

  it("refuses STAFF account creation by the same composition", async () => {
    const staff = actor(w.staffA, w.orgA, "STAFF");

    expect(canManageOrganization(staff).allowed).toBe(false);

    for (const role of ["USER", "STAFF", "TRAINER", "ADMIN"] as const) {
      const permitted =
        canManageOrganization(staff).allowed && canAssignRole(staff, role).allowed;
      expect(permitted).toBe(false);
    }
  });

  it("refuses STAFF programme authoring and prescribing, while allowing them to watch", async () => {
    const staff = actor(w.staffA, w.orgA, "STAFF");
    await createAssignment(w.orgA, w.staffA, w.customerAssigned);

    expect(canManageProgrammes(staff).allowed).toBe(false);
    expect(canPrescribe(staff).allowed).toBe(false);
    expect(canManageOrganization(staff).allowed).toBe(false);

    // But an assignment does give them the practice of the person they support.
    expect(
      (await resolveMemberAccess(staff, w.customerAssigned)).decision.allowed,
    ).toBe(true);
    expect((await listCaseload(staff)).map((c) => c.customerId)).toEqual([
      w.customerAssigned,
    ]);
  });

  it("refuses a TRAINER an unassigned member in their own organisation", async () => {
    const trainer = actor(w.trainerA, w.orgA, "TRAINER");
    await createAssignment(w.orgA, w.trainerA, w.customerAssigned);

    const { decision, memberExists } = await resolveMemberAccess(
      trainer,
      w.customerUnassigned,
    );

    expect(decision).toEqual({ allowed: false, reason: "NOT_ASSIGNED" });
    // Exists — they are administrable by the organisation, just not readable by this
    // trainer. A 404 here would be a lie the admin roster already contradicts.
    expect(memberExists).toBe(true);

    // And the caseload query agrees with the gate rather than differing from it.
    expect((await listCaseload(trainer)).map((c) => c.customerId)).not.toContain(
      w.customerUnassigned,
    );
  });

  it("refuses every role a member of another organisation, indistinguishably from nonexistent", async () => {
    for (const [id, role] of [
      [w.adminA, "ADMIN"],
      [w.trainerA, "TRAINER"],
      [w.staffA, "STAFF"],
    ] as const) {
      const { decision, memberExists } = await resolveMemberAccess(
        actor(id, w.orgA, role),
        w.customerB,
      );

      expect(decision.allowed).toBe(false);
      // The cross-tenant answer must not distinguish "denied" from "no such person",
      // or this becomes an oracle for enumerating another tenant's roll.
      expect(memberExists).toBe(false);
    }
  });

  it("refuses a CUSTOMER everything except themselves", async () => {
    const customer = actor(w.customerAssigned, w.orgA, "USER");

    expect(canManageOrganization(customer).allowed).toBe(false);
    expect(canManageProgrammes(customer).allowed).toBe(false);
    expect(canPrescribe(customer).allowed).toBe(false);
    expect(canAssignRole(customer, "USER").allowed).toBe(false);

    expect(
      (await resolveMemberAccess(customer, w.customerAssigned)).decision.allowed,
    ).toBe(true);
    expect(
      (await resolveMemberAccess(customer, w.customerUnassigned)).decision,
    ).toEqual({ allowed: false, reason: "NOT_ASSIGNED" });

    // A member never carries a caseload, so the listing is empty rather than filtered.
    expect(await listCaseload(customer)).toEqual([]);
  });

  it("gives a PLATFORM actor no member data, whatever the assignment says", async () => {
    // ADR-001: platform accounts administer organisations, not the people inside them.
    // Passing `true` for the assignment is the point — even a real one grants nothing.
    expect(
      canAccessMemberData(
        { domain: "PLATFORM", accountId: "owner-1", role: "SUPER_ADMIN" },
        { userId: w.customerAssigned, organizationId: w.orgA },
        true,
      ),
    ).toEqual({ allowed: false, reason: "CROSS_DOMAIN" });
  });

  it("keeps an ADMIN inside their own organisation", async () => {
    const foreign = actor(w.adminB, w.orgB, "ADMIN");

    // Administering their own organisation: yes. Reaching into another: no.
    expect(canManageOrganization(foreign).allowed).toBe(true);
    expect(
      (await resolveMemberAccess(foreign, w.customerAssigned)).memberExists,
    ).toBe(false);

    // And the roster is scoped in SQL, not filtered afterwards.
    const roll = await listMembers(w.orgB, { kind: "MEMBERS" });
    expect(roll.map((m) => m.id)).toEqual([w.customerB]);
  });
});
