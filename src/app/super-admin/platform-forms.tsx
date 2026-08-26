"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AVAILABLE_LOCALES, LOCALE_LABELS } from "@/i18n/locales";
import {
  createAdminAction,
  createOrganizationAction,
  type PlatformState,
} from "./actions";

/**
 * The platform console's two write forms.
 *
 * Kept together because they are one workflow: a tenant is created, then given its first
 * administrator. Splitting them across pages would hide the second step behind navigation
 * an operator only takes once per tenant and would therefore forget.
 *
 * Neither form offers a role, a status, or a join code. Administrators are always ADMIN
 * and always INVITED; self-registration stays closed until the tenant opens it
 * deliberately. Those are decisions the console makes, not choices it presents.
 */

const INITIAL: PlatformState = { status: "IDLE" };

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs " +
  "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

function Result({ state }: { state: PlatformState }) {
  if (state.status === "DONE") {
    return (
      <p className="text-sm text-foreground" role="status">
        {state.message}
      </p>
    );
  }
  if (state.status === "ERROR" && !state.fieldErrors) {
    return (
      <p className="text-sm text-destructive" role="alert">
        {state.message}
      </p>
    );
  }
  return null;
}

export function CreateOrganizationForm() {
  const [state, action, pending] = useActionState(createOrganizationAction, INITIAL);
  const f = state.fieldErrors ?? {};

  return (
    <form action={action} className="space-y-4">
      <Result state={state} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="org-name">Name</Label>
          <Input id="org-name" name="name" required maxLength={200} />
          {f.name && (
            <p className="text-sm text-destructive" role="alert">
              {f.name}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="org-slug">Slug</Label>
          <Input
            id="org-slug"
            name="slug"
            required
            maxLength={64}
            placeholder="studio-a"
            className="font-mono"
            aria-describedby="slug-hint"
          />
          {f.slug ? (
            <p className="text-sm text-destructive" role="alert">
              {f.slug}
            </p>
          ) : (
            <p id="slug-hint" className="type-meta text-muted-foreground">
              Lower-case letters, numbers and hyphens. Appears in URLs.
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="org-timezone">Timezone</Label>
          <Input id="org-timezone" name="timezone" defaultValue="Asia/Kolkata" maxLength={64} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="org-locale">Language</Label>
          {/*
            Driven by AVAILABLE_LOCALES, not by a hard-coded list.

            This offered English, हिन्दी and తెలుగు. Only `messages/en.json` exists, and
            `AVAILABLE_LOCALES` is `["en"]` precisely because a locale must not be listed
            until its messages file does — so choosing either of the other two set a
            column that `loadMessages` then quietly fell back to English for. A control
            with two options that do nothing is worse than a control with one that works;
            when a translation lands, adding it to AVAILABLE_LOCALES lights this up with
            no change here.
          */}
          <select id="org-locale" name="locale" defaultValue="en" className={SELECT_CLASS}>
            {AVAILABLE_LOCALES.map((locale) => (
              <option key={locale} value={locale} lang={locale}>
                {LOCALE_LABELS[locale]}
              </option>
            ))}
          </select>
          {AVAILABLE_LOCALES.length === 1 && (
            <p className="type-meta text-muted-foreground">
              English is the only translated interface so far.
            </p>
          )}
        </div>
      </div>

      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Creating…" : "Create organisation"}
      </Button>

      <p className="type-meta text-muted-foreground">
        Self-registration is closed on creation. The tenant opens it by setting a join code.
      </p>
    </form>
  );
}

export function CreateAdminForm({
  organizations,
}: {
  organizations: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState(createAdminAction, INITIAL);
  const f = state.fieldErrors ?? {};

  if (organizations.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Create an organisation first — an administrator belongs to one.
      </p>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <Result state={state} />

      <div className="space-y-2">
        <Label htmlFor="admin-org">Organisation</Label>
        <select id="admin-org" name="organizationId" required className={SELECT_CLASS}>
          <option value="">Choose an organisation…</option>
          {organizations.map((organization) => (
            <option key={organization.id} value={organization.id}>
              {organization.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="admin-name">Full name</Label>
          <Input id="admin-name" name="fullName" required maxLength={200} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="admin-email">Email address</Label>
          <Input id="admin-email" name="email" type="email" required />
          {f.email && (
            <p className="text-sm text-destructive" role="alert">
              {f.email}
            </p>
          )}
        </div>
      </div>

      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Inviting…" : "Invite administrator"}
      </Button>

      <p className="type-meta text-muted-foreground">
        They are invited, not activated, and receive no member data until somebody is
        assigned to them.
      </p>
    </form>
  );
}
