import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthShell } from "@/components/auth/auth-shell";
import { currentClerkIdentity } from "@/server/auth/clerk";
import { listEnterableMemberships } from "@/server/auth/sign-in";

import { ChooseOrganizationForm } from "./choose-form";

export const metadata: Metadata = { title: "Choose an organisation" };
export const dynamic = "force-dynamic";

/**
 * For an address that belongs to more than one organization (ADR-012).
 *
 * The list is re-derived from the live Clerk identity on every render, never passed
 * through the URL — which organizations an address belongs to is disclosed only to the
 * person who has proved control of it.
 */
export default async function ChooseOrganizationPage() {
  const identity = await currentClerkIdentity();
  if (!identity) redirect("/sign-in");

  const memberships = await listEnterableMemberships(identity);

  // Zero or one: nothing to choose. /auth/continue handles both cases.
  if (memberships.length < 2) redirect("/auth/continue");

  return (
    <AuthShell title="Choose an organisation" description="This address belongs to more than one.">
      <ChooseOrganizationForm memberships={memberships} />
    </AuthShell>
  );
}
