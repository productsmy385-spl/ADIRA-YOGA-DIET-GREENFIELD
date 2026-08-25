import { UserMinus, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";

import { releaseFromCaseloadAction, takeIntoCaseloadAction } from "./actions";

/**
 * The control that makes prescribing reachable at all.
 *
 * WHY THIS EXISTS
 *
 * `canAccessMemberData` requires an active `consultant_assignments` row before an admin
 * may read anybody's practice, and `resolveMemberAccess` enforces it. Until this control
 * shipped there was no way in the product to CREATE that row — `takeIntoCaseloadAction`
 * had been written, audited and left with no caller. The result was a closed loop: an
 * admin added a member, opened them, got a 404, and could never prescribe. Every
 * downstream surface (plans, activities, check-ins, reports) was unreachable behind it.
 *
 * WHY THE BUTTON IS SAFE TO SHOW ON AN UNAUTHORISED MEMBER
 *
 * Taking somebody on is ADMINISTRATIVE, gated by `canManageOrganization`, and reads
 * nothing about them — see the header of `actions.ts` for why it MUST NOT require data
 * reach, and why gating it that way would deadlock the product. Rendering it beside a
 * member this admin cannot yet read is therefore correct: it is the one action that is
 * supposed to be available before access exists.
 */
export function TakeIntoCaseload({ customerId }: { customerId: string }) {
  return (
    <form action={takeIntoCaseloadAction}>
      <input type="hidden" name="customerId" value={customerId} />
      <Button type="submit" size="sm">
        <UserPlus aria-hidden />
        Take into my caseload
      </Button>
    </form>
  );
}

/**
 * Releasing withdraws this admin's own reach immediately — the assignment row is closed
 * and `hasActiveAssignment` filters on `ended_at IS NULL`. Nothing about the member is
 * deleted; ending a working relationship is not a reason to destroy a health record.
 */
export function ReleaseFromCaseload({ customerId }: { customerId: string }) {
  return (
    <form action={releaseFromCaseloadAction}>
      <input type="hidden" name="customerId" value={customerId} />
      <Button type="submit" size="sm" variant="outline">
        <UserMinus aria-hidden />
        Release from caseload
      </Button>
    </form>
  );
}
