"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Check, Clock, X } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { approveRequestAction, rejectRequestAction, type ReviewState } from "./actions";

/**
 * One access request, with its decision controls.
 *
 * A client component so approve and reject can carry a confirmation step and their own
 * pending state — a decision that creates an account should not be one click away from a
 * mis-tap, and an admin working through a queue needs to see which row is in flight.
 *
 * Status is conveyed by an icon and a word, never by colour alone.
 */

export interface RequestView {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  reason: string | null;
  status: string;
  createdAt: string;
  reviewedAt: string | null;
  reviewNotes: string | null;
}

const INITIAL: ReviewState = { status: "IDLE" };

const STATUS_ICON: Record<string, React.ReactNode> = {
  PENDING: <Clock className="size-3.5" aria-hidden />,
  APPROVED: <Check className="size-3.5" aria-hidden />,
  REJECTED: <X className="size-3.5" aria-hidden />,
  CANCELLED: <X className="size-3.5" aria-hidden />,
};

function PendingButton({
  children,
  variant,
}: {
  children: React.ReactNode;
  variant?: "default" | "outline" | "destructive";
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant={variant} disabled={pending} aria-busy={pending}>
      {pending ? "Working…" : children}
    </Button>
  );
}

export function ReviewCard({ request }: { request: RequestView }) {
  const [approveState, approve] = useActionState(approveRequestAction, INITIAL);
  const [rejectState, reject] = useActionState(rejectRequestAction, INITIAL);
  const [confirming, setConfirming] = useState<"APPROVE" | "REJECT" | null>(null);

  const state = approveState.status !== "IDLE" ? approveState : rejectState;
  const decided = request.status !== "PENDING" || state.status === "DONE";

  return (
    <li className="rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-medium text-card-foreground">{request.fullName}</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">{request.email}</p>
          {request.phone ? (
            <p className="text-sm text-muted-foreground">{request.phone}</p>
          ) : null}
        </div>

        <Badge variant={request.status === "PENDING" ? "secondary" : "outline"}>
          <span className="inline-flex items-center gap-1.5">
            {STATUS_ICON[request.status]}
            {request.status}
          </span>
        </Badge>
      </div>

      {request.reason ? (
        <p className="mt-3 rounded-lg bg-muted/60 p-3 text-sm/relaxed text-muted-foreground">
          {request.reason}
        </p>
      ) : null}

      <p className="mt-3 text-xs text-muted-foreground">
        Requested {request.createdAt}
        {request.reviewedAt ? ` · decided ${request.reviewedAt}` : ""}
      </p>

      {request.reviewNotes ? (
        <p className="mt-2 text-xs text-muted-foreground">Note: {request.reviewNotes}</p>
      ) : null}

      {state.message ? (
        <Alert
          variant={state.status === "ERROR" ? "destructive" : "default"}
          className="mt-4"
        >
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}

      {decided ? null : confirming ? (
        <form
          action={confirming === "APPROVE" ? approve : reject}
          className="mt-4 space-y-3 rounded-lg border border-border p-4"
        >
          <input type="hidden" name="requestId" value={request.id} />

          <p className="text-sm text-card-foreground">
            {confirming === "APPROVE"
              ? "Approving creates an invited account. They will still confirm their email address before they can sign in."
              : "Rejecting creates no account. They can request access again later."}
          </p>

          <div className="space-y-1.5">
            <Label htmlFor={`notes-${request.id}`} className="text-xs">
              Internal note <span className="text-muted-foreground">(optional)</span>
            </Label>
            <textarea
              id={`notes-${request.id}`}
              name="notes"
              rows={2}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <PendingButton variant={confirming === "APPROVE" ? "default" : "destructive"}>
              {confirming === "APPROVE" ? "Confirm approval" : "Confirm rejection"}
            </PendingButton>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setConfirming(null)}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setConfirming("APPROVE")}>
            Approve &amp; create account
          </Button>
          <Button size="sm" variant="outline" onClick={() => setConfirming("REJECT")}>
            Reject
          </Button>
        </div>
      )}
    </li>
  );
}
