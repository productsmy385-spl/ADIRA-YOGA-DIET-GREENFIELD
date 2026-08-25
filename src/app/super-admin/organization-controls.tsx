import { Button } from "@/components/ui/button";

import { setAdminStatusAction, setOrganizationStatusAction } from "./actions";

/**
 * The lifecycle controls for a tenant and its administrators.
 *
 * Both actions already existed, both were audited, both were tested — and neither had a
 * caller. Suspending a tenant or an administrator was therefore impossible through the
 * product, which matters more than it sounds: suspension is the only way to cut off
 * access without destroying anybody's data, and its absence makes deletion the only
 * available response to a problem.
 *
 * Plain forms posting to server actions. No client component, no `useActionState` — these
 * take no input beyond the row they belong to, and the page revalidates on completion.
 */

export function OrganizationStatusControl({
  organizationId,
  status,
}: {
  organizationId: string;
  status: string;
}) {
  /*
   * SUSPENDING ENDS ACCESS AT THE NEXT REQUEST, not at some cleanup job:
   * `TENANT_SESSION_SELECT` joins `organizations` and requires `o.status = 'ACTIVE'`, so
   * every live session in the tenant stops resolving the moment this commits. Nothing is
   * deleted — a suspended tenant's data is still theirs, and reactivating restores it.
   *
   * CLOSED is deliberately not offered here. It reads as terminal, the action treats it
   * as just another status, and a one-click control for it beside "Suspend" invites the
   * irreversible-looking choice to be made by accident.
   */
  const suspended = status !== "ACTIVE";

  return (
    <form action={setOrganizationStatusAction}>
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="status" value={suspended ? "ACTIVE" : "SUSPENDED"} />
      <Button type="submit" size="sm" variant={suspended ? "default" : "outline"}>
        {suspended ? "Reactivate organisation" : "Suspend organisation"}
      </Button>
    </form>
  );
}

export function AdminStatusControl({
  userId,
  organizationId,
  status,
}: {
  userId: string;
  organizationId: string;
  status: string;
}) {
  /*
   * INVITED is not a state suspension applies to — the account has never been used, and
   * `setAdminStatusAction` accepts only ACTIVE and SUSPENDED anyway. Rendering a button
   * the action will silently ignore is exactly the dead control this pass is removing.
   */
  if (status !== "ACTIVE" && status !== "SUSPENDED") {
    return <span className="type-meta text-muted-foreground">awaiting first sign-in</span>;
  }

  const suspended = status === "SUSPENDED";

  return (
    <form action={setAdminStatusAction}>
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="status" value={suspended ? "ACTIVE" : "SUSPENDED"} />
      <Button type="submit" size="xs" variant="ghost">
        {suspended ? "Reactivate" : "Suspend"}
      </Button>
    </form>
  );
}
