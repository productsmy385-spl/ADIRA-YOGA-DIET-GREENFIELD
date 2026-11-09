"use client";

import { useActionState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import type { AvailableMembership } from "@/server/auth/sign-in";

import { chooseOrganizationAction, type ChooseState } from "../actions";

/**
 * One button per organization. A form action, so it works before hydration — which
 * matters on the slow connections many of Adira's customers have.
 */
export function ChooseOrganizationForm({ memberships }: { memberships: AvailableMembership[] }) {
  const [state, action, pending] = useActionState<ChooseState, FormData>(
    chooseOrganizationAction,
    {},
  );

  return (
    <form action={action} className="space-y-4" aria-busy={pending}>
      <div className="space-y-2">
        {memberships.map((membership) => (
          <button
            key={membership.organizationId}
            type="submit"
            name="organizationId"
            value={membership.organizationId}
            disabled={pending}
            className="flex w-full items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-left transition-colors hover:border-primary/40 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-60"
          >
            <span className="font-medium text-card-foreground">{membership.organizationName}</span>
            <span className="text-xs text-muted-foreground">{membership.role}</span>
          </button>
        ))}
      </div>

      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
    </form>
  );
}
