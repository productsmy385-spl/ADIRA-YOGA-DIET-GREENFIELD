import type { Metadata } from "next";
import Link from "next/link";
import { Activity, Salad, UserCog, UserPlus, Users } from "lucide-react";

import { AppNav } from "@/components/nav/app-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { PageShell } from "@/components/ui/page-shell";
import { OrganizationAccessKeyCard } from "@/components/ui/organization-access-key-card";
import { requireRole } from "@/server/auth/guards";
import { MetricCard, MetricGrid } from "@/components/ui/metric";
import { actorFromSession } from "@/server/authorization/member-access";
import { canActOn, canAssignRole } from "@/server/authorization/permissions";
import { caseloadCounts, listMembers } from "@/server/repositories/members";
import { listTeamProfiles } from "@/server/repositories/users";
import { teamSessionWorkload } from "@/server/repositories/yoga-sessions";

import { AssignMemberForm, TeamRowControls } from "./team-controls";
import { getJoinCode } from "@/server/repositories/organizations";
import { regenerateJoinCodeAction } from "../access-requests/actions";

export const metadata: Metadata = { title: "Team" };
export const dynamic = "force-dynamic";

/**
 * The organisation's staff — administrators, trainers and support staff.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THIS PAGE EXISTS
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Migration 011 gave an ADMIN the ability to create TRAINER and STAFF accounts, and the
 * add-member form offers all three roles. Nothing listed them. `/admin/members` filters to
 * `kind: "MEMBERS"` — people receiving care — so a newly invited trainer vanished the
 * moment they were created: unfindable, unauditable, and impossible to tell apart from an
 * invitation that had silently failed.
 *
 * That is the same create-with-no-listing shape that made `takeIntoCaseloadAction` and
 * `createOrganizationAction` unreachable earlier in this project. A role the roster cannot
 * show is a role nobody can manage.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THE SAME LINE `/admin/members` DRAWS, FOR THE SAME REASON
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * This is ADMINISTRATION, so it is organisation-wide and shows identity, role and status.
 * It shows NO member health data — no adherence, no activity, no check-ins — and it must
 * not start to. What it does show that `/admin/members` cannot is the reverse relationship:
 * how many members each person carries, which is a count of assignments, never who they
 * are.
 *
 * `listMembers` selects that count in SQL and returns no member identity with it.
 */

const STATUS_LABEL: Record<string, string> = {
  INVITED: "Invited",
  ACTIVE: "Active",
  SUSPENDED: "Suspended",
  LOCKED: "Locked",
  DISABLED: "Deactivated",
  PENDING: "Pending",
};

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Administrator",
  ORG_OWNER: "Administrator",
  TEAM_MANAGER: "Team manager",
  TRAINER: "Yoga instructor",
  DIETITIAN: "Dietitian",
  STAFF: "Staff",
};

const ROLE_BLURB: Record<string, string> = {
  ADMIN: "Administers the organisation. Reads a member's practice only when assigned.",
  ORG_OWNER: "Administers the organisation. Reads a member's practice only when assigned.",
  TEAM_MANAGER: "Manages members and the team. No organisation settings or website.",
  TRAINER: "Builds programmes and prescribes them to the members assigned to them.",
  DIETITIAN: "Builds and prescribes diet plans for assigned members. Sees diet data only.",
  STAFF: "Follows and messages the members assigned to them. Authors nothing.",
};

const TEAM_ROLES = ["TEAM_MANAGER", "TRAINER", "DIETITIAN", "STAFF"] as const;

export default async function TeamPage() {
  const session = await requireRole("ADMIN", "TEAM_MANAGER");
  const self = actorFromSession(session);

  const [team, joinCode, profiles, workload, caseloads, roster] = await Promise.all([
    listMembers(session.organizationId, { kind: "STAFF" }),
    getJoinCode(session.organizationId),
    listTeamProfiles(session.organizationId),
    teamSessionWorkload(session.organizationId),
    caseloadCounts(session.organizationId),
    listMembers(session.organizationId, { kind: "MEMBERS" }),
  ]);

  const count = (role: string) => team.filter((t) => t.role === role).length;
  const invited = team.filter((t) => t.status === "INVITED").length;
  const practitioners = team.filter((t) => t.status === "ACTIVE");
  const grantable = TEAM_ROLES.filter((r) => canAssignRole(self, r).allowed);

  return (
    <div className="theme-bg-wrapper theme-fresh-green app-shell">
      <AppNav role={session.role} currentPath="/admin/team" />

      <PageShell env="env-team" width="wide">
        <PageHeader title="Team" description={`Everyone who delivers care at ${session.organizationName}.`}>
          <Button asChild size="sm">
            <Link href="/admin/members/new">
              <UserPlus aria-hidden />
              Add team member
            </Link>
          </Button>
        </PageHeader>

        <MetricGrid columns={4} label="Team at a glance" className="mt-6">
          <MetricCard label="Yoga instructors" value={count("TRAINER")} icon={<Activity />} tone="turquoise" />
          <MetricCard label="Dietitians" value={count("DIETITIAN")} icon={<Salad />} tone="orange" />
          <MetricCard label="Team managers" value={count("TEAM_MANAGER")} icon={<UserCog />} tone="violet" />
          <MetricCard label="Staff" value={count("STAFF")} icon={<Users />} tone="blue" />
        </MetricGrid>

        {/* The access key is an organisation setting — ADMIN only (ADR-016). */}
        {session.role === "ADMIN" ? (
          <OrganizationAccessKeyCard joinCode={joinCode} onRegenerateAction={regenerateJoinCodeAction} />
        ) : null}

        {invited > 0 && (
          <p role="status" className="mt-6 rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
            {invited} {invited === 1 ? "person has" : "people have"} not signed in yet. An invited account
            cannot hold a session until they verify their address.
          </p>
        )}

        {roster.length > 0 && practitioners.length > 0 ? (
          <section aria-labelledby="assign" className="mt-8 rounded-2xl border border-border-glass bg-surface p-5">
            <h2 id="assign" className="font-semibold text-foreground">
              Assign a member to a practitioner
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              An assignment is what lets a practitioner see a member&rsquo;s practice. Nothing else grants it.
            </p>
            <div className="mt-4">
              <AssignMemberForm
                members={roster.map((m) => ({ id: m.id, name: m.fullName }))}
                practitioners={practitioners.map((p) => ({
                  id: p.id,
                  name: `${p.fullName} — ${ROLE_LABEL[p.role] ?? p.role}`,
                }))}
              />
            </div>
          </section>
        ) : null}

        {team.length === 0 ? (
          <div className="mt-8 rounded-xl border border-dashed border-border p-10 text-center">
            <Users className="mx-auto size-8 text-muted-foreground" aria-hidden />
            <p className="mt-4 text-sm/relaxed text-muted-foreground">
              Nobody on the team yet. Add an instructor, dietitian or staff member.
            </p>
          </div>
        ) : (
          <ul className="mt-8 grid gap-4 lg:grid-cols-2">
            {team.map((person) => {
              const profile = profiles.get(person.id) ?? { specialisation: null, qualifications: null, bio: null };
              const load = workload.get(person.id);
              const target = {
                domain: "TENANT" as const,
                userId: person.id,
                organizationId: session.organizationId,
                role: person.role,
              };
              const actOn = canActOn(self, target).allowed;
              const options = grantable.includes(person.role as (typeof TEAM_ROLES)[number])
                ? [...grantable]
                : [person.role, ...grantable];
              return (
                <li key={person.id} className="flex flex-col rounded-2xl border border-border-glass bg-surface p-5 shadow-xs">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground">
                        {person.fullName}
                        {person.id === session.userId ? (
                          <span className="ml-2 text-xs font-normal text-muted-foreground">you</span>
                        ) : null}
                      </p>
                      <p className="truncate text-sm text-muted-foreground">{person.email}</p>
                    </div>
                    {/* Word, not colour — status is never conveyed by colour alone. */}
                    <Badge variant={person.status === "ACTIVE" ? "secondary" : "outline"}>
                      {STATUS_LABEL[person.status] ?? person.status}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm font-medium text-foreground">{ROLE_LABEL[person.role] ?? person.role}</p>
                  <p className="text-xs text-muted-foreground">{ROLE_BLURB[person.role] ?? ""}</p>
                  {profile.specialisation || profile.qualifications ? (
                    <p className="mt-2 text-sm text-muted-foreground">
                      {[profile.specialisation, profile.qualifications].filter(Boolean).join(" · ")}
                    </p>
                  ) : null}
                  {/* COUNTS, never lists: who is on a caseload is member data. */}
                  <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg bg-muted/50 p-2">
                      <dt className="text-[11px] text-muted-foreground">Members</dt>
                      <dd className="font-semibold tabular-nums">{caseloads.get(person.id) ?? 0}</dd>
                    </div>
                    <div className="rounded-lg bg-muted/50 p-2">
                      <dt className="text-[11px] text-muted-foreground">Sessions next 7d</dt>
                      <dd className="font-semibold tabular-nums">{load?.sessionsUpcoming ?? 0}</dd>
                    </div>
                    <div className="rounded-lg bg-muted/50 p-2">
                      <dt className="text-[11px] text-muted-foreground">Completed 30d</dt>
                      <dd className="font-semibold tabular-nums">{load?.sessionsCompleted30d ?? 0}</dd>
                    </div>
                  </dl>
                  {actOn ? (
                    <div className="mt-4 border-t border-border pt-4">
                      <TeamRowControls
                        userId={person.id}
                        name={person.fullName}
                        role={person.role}
                        status={person.status}
                        grantableRoles={options}
                        profile={{
                          specialisation: profile.specialisation ?? "",
                          qualifications: profile.qualifications ?? "",
                          bio: profile.bio ?? "",
                        }}
                      />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        <p className="mt-6 text-xs/relaxed text-muted-foreground">
          You can change the role or status only of people below your own role. Being on the team grants
          no reach into a member&rsquo;s practice — only an assignment does.
        </p>
      </PageShell>
    </div>
  );
}
