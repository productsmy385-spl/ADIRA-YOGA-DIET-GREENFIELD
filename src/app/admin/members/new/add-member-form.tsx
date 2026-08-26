"use client";

import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addMemberAction, type AddMemberState } from "../actions";

/**
 * Add one member.
 *
 * The counterpart to the CSV import for the case that is actually most common — one person,
 * typed in. Deliberately a plain `<form action={…}>` posting to a server action: it works
 * before hydration, it works with the keyboard, and there is no client-side state that
 * could disagree with what the server did.
 *
 * NO ROLE FIELD. The action creates a USER and nothing else; see `actions.ts` for why an
 * ADMIN cannot promote a peer. A disabled role select would only invite someone to try.
 */

const INITIAL: AddMemberState = { status: "IDLE" };

function FieldError({ message, id }: { message?: string; id: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-sm text-destructive" role="alert">
      {message}
    </p>
  );
}

export function AddMemberForm() {
  const [state, action, pending] = useActionState(addMemberAction, INITIAL);

  if (state.status === "DONE") {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-center" role="status">
        <CheckCircle2 className="mx-auto size-8 text-primary" aria-hidden />
        <h2 className="mt-4 font-medium text-card-foreground">Member invited</h2>
        <p className="mx-auto mt-2 max-w-prose text-sm/relaxed text-muted-foreground">
          {state.message}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {/*
            A link rather than a state reset, so the second add starts from a genuinely
            clean form — including the browser's own autofill state, which a reset leaves
            behind and which is how the previous person's details end up on the next row.
          */}
          <Button asChild>
            <Link href="/admin/members/new">Add another</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/admin/members">Back to members</Link>
          </Button>
        </div>
      </div>
    );
  }

  const f = state.fieldErrors ?? {};

  return (
    <form action={action} className="space-y-5">
      {state.status === "ERROR" && !state.fieldErrors && (
        <p className="text-sm text-destructive" role="alert">
          {state.message}
        </p>
      )}

      <div className="space-y-2">
        <Label htmlFor="fullName">Full name</Label>
        <Input
          id="fullName"
          name="fullName"
          required
          autoFocus
          autoComplete="off"
          maxLength={200}
          aria-invalid={Boolean(f.fullName)}
          aria-describedby={f.fullName ? "fullName-error" : undefined}
        />
        <FieldError id="fullName-error" message={f.fullName} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Email address</Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="off"
          aria-invalid={Boolean(f.email)}
          aria-describedby={f.email ? "email-error" : "email-hint"}
        />
        {f.email ? (
          <FieldError id="email-error" message={f.email} />
        ) : (
          <p id="email-hint" className="text-sm text-muted-foreground">
            They sign in with this address. It is how the account is activated.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone">Phone number (optional)</Label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          autoComplete="off"
          maxLength={40}
          aria-invalid={Boolean(f.phone)}
          aria-describedby={f.phone ? "phone-error" : undefined}
        />
        <FieldError id="phone-error" message={f.phone} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="role">Role</Label>
        {/*
          THREE OPTIONS, AND ADMIN IS NOT ONE OF THEM.
          `canAssignRole` requires the actor to strictly outrank the role granted, so an
          ADMIN granting ADMIN is refused server-side regardless of what is posted here —
          a second administrator is a privilege escalation and belongs to the platform
          console. Omitting the option keeps the form from offering a choice that would
          only ever produce an error.

          The server re-checks every one of these against `canAssignRole` on submit. This
          select decides what is offered, never what is permitted.
        */}
        <select
          id="role"
          name="role"
          defaultValue="USER"
          aria-describedby="role-hint"
          className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <option value="USER">Customer — follows a plan you assign</option>
          <option value="TRAINER">Trainer — builds plans and works a caseload</option>
          <option value="STAFF">Staff — follows a caseload, builds nothing</option>
        </select>
        <FieldError id="role-error" message={f.role} />
        <p id="role-hint" className="text-sm text-muted-foreground">
          A trainer can create programmes and prescribe them. Staff can see and message the
          people assigned to them. Neither can administer the organisation or add accounts.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="locale">Language</Label>
        {/*
          A native select. The product supports three languages and this is a three-item
          choice on a form an admin fills in occasionally — a custom listbox would cost
          keyboard and screen-reader behaviour the browser already gets right.
        */}
        <select
          id="locale"
          name="locale"
          defaultValue="en"
          className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <option value="en">English</option>
          <option value="hi">हिन्दी (Hindi)</option>
          <option value="te">తెలుగు (Telugu)</option>
        </select>
        <p className="text-sm text-muted-foreground">
          Used for their interface and reminders. They can change it themselves.
        </p>
      </div>

      <div className="flex flex-wrap gap-3 pt-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Inviting…" : "Invite member"}
        </Button>
        <Button asChild variant="ghost">
          <Link href="/admin/members">Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
