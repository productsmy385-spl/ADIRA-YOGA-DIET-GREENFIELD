"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  assignMemberAction,
  changeRoleAction,
  saveProfileAction,
  setStatusAction,
  type TeamState,
} from "./actions";

const ROLE_NAME: Record<string, string> = {
  TEAM_MANAGER: "Team manager",
  TRAINER: "Yoga instructor",
  DIETITIAN: "Dietitian",
  STAFF: "Staff",
};

const SELECT = "h-10 rounded-md border border-input bg-transparent px-3 text-sm";

function Message({ state }: { state: TeamState }) {
  if (!state.message) return null;
  return (
    <p role="status" className={`text-xs ${state.ok ? "text-accent-green-ink" : "text-destructive"}`}>
      {state.message}
    </p>
  );
}

/** Role, status and profile controls for one team member the viewer outranks. */
export function TeamRowControls({
  userId,
  name,
  role,
  status,
  grantableRoles,
  profile,
}: {
  userId: string;
  name: string;
  role: string;
  status: string;
  /** Computed server-side with canAssignRole; the action re-checks regardless. */
  grantableRoles: string[];
  profile: { specialisation: string; qualifications: string; bio: string };
}) {
  const [roleState, roleAction, rolePending] = useActionState<TeamState, FormData>(changeRoleAction, {});
  const [statusState, statusAction, statusPending] = useActionState<TeamState, FormData>(setStatusAction, {});
  const [profileState, profileAction, profilePending] = useActionState<TeamState, FormData>(saveProfileAction, {});

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        {grantableRoles.length > 1 ? (
          <form action={roleAction} className="flex items-end gap-2">
            <input type="hidden" name="userId" value={userId} />
            <label className="text-xs">
              <span className="sr-only">Role for {name}</span>
              <select name="role" defaultValue={role} className={SELECT}>
                {grantableRoles.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_NAME[r] ?? r}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit" size="sm" variant="outline" disabled={rolePending}>
              Change role
            </Button>
          </form>
        ) : null}
        {status === "ACTIVE" || status === "SUSPENDED" ? (
          <form action={statusAction}>
            <input type="hidden" name="userId" value={userId} />
            <input type="hidden" name="status" value={status === "ACTIVE" ? "SUSPENDED" : "ACTIVE"} />
            <Button type="submit" size="sm" variant="ghost" disabled={statusPending}>
              {status === "ACTIVE" ? "Deactivate" : "Reactivate"}
            </Button>
          </form>
        ) : null}
      </div>
      <Message state={roleState} />
      <Message state={statusState} />

      <details className="rounded-lg border border-border px-3 py-2">
        <summary className="cursor-pointer text-sm font-medium">Edit profile</summary>
        <form action={profileAction} className="mt-3 space-y-3">
          <input type="hidden" name="userId" value={userId} />
          <div>
            <Label htmlFor={`spec-${userId}`}>Specialisation</Label>
            <Input id={`spec-${userId}`} name="specialisation" maxLength={200} defaultValue={profile.specialisation} className="mt-1" />
          </div>
          <div>
            <Label htmlFor={`qual-${userId}`}>Qualifications</Label>
            <Input id={`qual-${userId}`} name="qualifications" maxLength={300} defaultValue={profile.qualifications} className="mt-1" />
          </div>
          <div>
            <Label htmlFor={`bio-${userId}`}>Short bio</Label>
            <textarea id={`bio-${userId}`} name="bio" rows={3} maxLength={600} defaultValue={profile.bio} className="mt-1 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" />
          </div>
          <Button type="submit" size="sm" disabled={profilePending}>
            Save profile
          </Button>
          <Message state={profileState} />
        </form>
      </details>
    </div>
  );
}

/** Put a member on a practitioner's caseload (members.assign). */
export function AssignMemberForm({
  members,
  practitioners,
}: {
  members: Array<{ id: string; name: string }>;
  practitioners: Array<{ id: string; name: string }>;
}) {
  const [state, action, pending] = useActionState<TeamState, FormData>(assignMemberAction, {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <label className="text-sm">
        <span className="block font-medium">Member</span>
        <select name="memberId" required className={`mt-1.5 ${SELECT}`}>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        <span className="block font-medium">Practitioner</span>
        <select name="practitionerId" required className={`mt-1.5 ${SELECT}`}>
          {practitioners.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" size="sm" disabled={pending}>
        Assign
      </Button>
      <Message state={state} />
    </form>
  );
}
