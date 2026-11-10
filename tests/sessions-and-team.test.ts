import { beforeEach, expect, it } from "vitest";

import { resolveMemberAccess } from "@/server/authorization/member-access";
import { query } from "@/server/db/pool";
import { createAssignment } from "@/server/repositories/members";
import { createOrganization } from "@/server/repositories/organizations";
import type { TenantSessionContext } from "@/server/repositories/sessions";
import { createUser } from "@/server/repositories/users";
import { listParticipants } from "@/server/repositories/yoga-sessions";
import {
  assignMemberToPractitioner,
  changeTeamRole,
  setTeamStatus,
} from "@/server/services/team";
import {
  addSessionParticipant,
  recordAttendance,
  scheduleSession,
  viewSession,
} from "@/server/services/yoga-sessions";

import { describeIsolated, resetDatabase } from "./helpers/sql-db";

/** Stage 5 security rules (brief §7–8, ADR-016), through the real services. */

type Role = TenantSessionContext["role"];
let org: string;

async function person(role: Role | "USER", email: string, orgId = org): Promise<TenantSessionContext> {
  const u = await createUser({ organizationId: orgId, email, fullName: email.split("@")[0], role, status: "ACTIVE" });
  return {
    sessionId: "00000000-0000-0000-0000-000000000000",
    userId: u.id,
    organizationId: orgId,
    organizationName: "Studio",
    organizationSlug: "studio",
    role: role as Role,
    email,
  } as unknown as TenantSessionContext;
}

describeIsolated("yoga sessions and team management", () => {
  let admin: TenantSessionContext;
  let trainer: TenantSessionContext;
  let otherTrainer: TenantSessionContext;
  let manager: TenantSessionContext;
  let staff: TenantSessionContext;
  let mine: TenantSessionContext;
  let notMine: TenantSessionContext;

  beforeEach(async () => {
    await resetDatabase();
    org = (await createOrganization({ name: "Studio", slug: "studio" })).id;
    admin = await person("ADMIN", "admin@s.example");
    trainer = await person("TRAINER", "trainer@s.example");
    otherTrainer = await person("TRAINER", "other@s.example");
    manager = await person("TEAM_MANAGER", "manager@s.example");
    staff = await person("STAFF", "staff@s.example");
    mine = await person("USER", "mine@s.example");
    notMine = await person("USER", "notmine@s.example");
    await createAssignment(org, trainer.userId, mine.userId);
    await createAssignment(org, otherTrainer.userId, notMine.userId);
  });

  const schedule = async (by: TenantSessionContext, instructorId: string) => {
    const r = await scheduleSession(by, {
      title: "Morning Hatha",
      startsAt: new Date(Date.now() + 864e5),
      durationMinutes: 60,
      instructorId,
      notes: null,
    });
    if (!r.ok) throw new Error(r.message);
    return r.value;
  };

  it("lets a trainer schedule only for themselves, and refuses staff", async () => {
    const id = await schedule(trainer, otherTrainer.userId); // instructor id is ignored for a trainer
    const [row] = await query<{ instructor_id: string }>(`SELECT instructor_id FROM yoga_sessions WHERE id = $1`, [id]);
    expect(row.instructor_id).toBe(trainer.userId);
    expect((await scheduleSession(staff, { title: "x", startsAt: new Date(), durationMinutes: 30, instructorId: staff.userId, notes: null })).ok).toBe(false);
  });

  it("adds only members on the actor's own caseload", async () => {
    const id = await schedule(trainer, trainer.userId);
    expect((await addSessionParticipant(trainer, id, mine.userId)).ok).toBe(true);
    expect((await addSessionParticipant(trainer, id, notMine.userId)).ok).toBe(false);
    expect((await listParticipants(org, id)).map((p) => p.memberId)).toEqual([mine.userId]);
  });

  it("hides participants the viewer cannot reach, showing only a count", async () => {
    const id = await schedule(admin, trainer.userId);
    await addSessionParticipant(trainer, id, mine.userId);
    // The admin has no assignment to `mine`, so sees the session but not who attended.
    const view = await viewSession(admin, id);
    expect(view.ok && view.value.visible).toEqual([]);
    expect(view.ok && view.value.hiddenCount).toBe(1);
  });

  it("lets only the instructor (or an admin with reach) mark attendance", async () => {
    const id = await schedule(trainer, trainer.userId);
    await addSessionParticipant(trainer, id, mine.userId);
    expect((await recordAttendance(otherTrainer, id, mine.userId, "ATTENDED")).ok).toBe(false);
    expect((await recordAttendance(trainer, id, mine.userId, "BOGUS")).ok).toBe(false);
    expect((await recordAttendance(trainer, id, mine.userId, "ATTENDED")).ok).toBe(true);
    expect((await listParticipants(org, id))[0].attendance).toBe("ATTENDED");
  });

  it("cannot reach a session from another organisation", async () => {
    const id = await schedule(trainer, trainer.userId);
    const otherOrg = (await createOrganization({ name: "Other", slug: "other" })).id;
    const outsider = await person("ADMIN", "admin@other.example", otherOrg);
    expect((await viewSession(outsider, id)).ok).toBe(false);
  });

  it("stops a team manager promoting to its own rank or above, or acting on peers and self", async () => {
    expect((await changeTeamRole(manager, trainer.userId, "TEAM_MANAGER")).ok).toBe(false);
    expect((await changeTeamRole(manager, trainer.userId, "DIETITIAN")).ok).toBe(true);
    expect((await changeTeamRole(manager, admin.userId, "STAFF")).ok).toBe(false);
    expect((await changeTeamRole(manager, manager.userId, "STAFF")).ok).toBe(false);
    const peer = await person("TEAM_MANAGER", "peer@s.example");
    expect((await setTeamStatus(manager, peer.userId, "SUSPENDED")).ok).toBe(false);
    const denied = await query(`SELECT 1 FROM audit_logs WHERE action LIKE 'team.%' AND outcome = 'DENIED'`);
    expect(denied.length).toBeGreaterThanOrEqual(3);
  });

  it("grants reach only through an assignment, which a team manager can create", async () => {
    expect((await resolveMemberAccess({ domain: "TENANT", userId: staff.userId, organizationId: org, role: "STAFF" }, notMine.userId)).decision.allowed).toBe(false);
    expect((await assignMemberToPractitioner(manager, notMine.userId, staff.userId)).ok).toBe(true);
    expect((await resolveMemberAccess({ domain: "TENANT", userId: staff.userId, organizationId: org, role: "STAFF" }, notMine.userId)).decision.allowed).toBe(true);
    // ...but holding the roster gives the manager no reach of its own.
    expect((await resolveMemberAccess({ domain: "TENANT", userId: manager.userId, organizationId: org, role: "TEAM_MANAGER" }, notMine.userId)).decision.allowed).toBe(false);
  });
});
