"use client";

import { Send } from "lucide-react";
import { useActionState, useRef } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { sendMemberNotificationAction, type AssignState } from "./actions";

/**
 * Send this member a message.
 *
 * It lands as a `CONSULTANT_MESSAGE` notification — in-app always, push where the member
 * has not muted it (`resolveChannels` forces IN_APP on regardless of preference, because
 * muting a channel is not opting out of being told).
 *
 * The form CLEARS on success. Leaving the text in place after a send reads as though
 * nothing happened, and the next thing an admin does is press the button again.
 */

const INITIAL: AssignState = { status: "IDLE" };

export function MessageForm({ customerId }: { customerId: string }) {
  const formRef = useRef<HTMLFormElement>(null);

  const [state, action, pending] = useActionState(
    async (previous: AssignState, formData: FormData) => {
      const result = await sendMemberNotificationAction(previous, formData);
      if (result.status === "DONE") formRef.current?.reset();
      return result;
    },
    INITIAL,
  );

  return (
    <form ref={formRef} action={action} className="space-y-4">
      <input type="hidden" name="customerId" value={customerId} />

      {state.status === "DONE" && state.message && (
        <p className="text-sm text-foreground" role="status">
          {state.message}
        </p>
      )}
      {state.status === "ERROR" && state.message && (
        <p className="text-sm text-destructive" role="alert">
          {state.message}
        </p>
      )}

      <div className="space-y-2">
        <Label htmlFor="message-title">Subject</Label>
        <Input
          id="message-title"
          name="title"
          required
          maxLength={120}
          placeholder="A note about your practice"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="message-body">Message</Label>
        <textarea
          id="message-body"
          name="body"
          required
          maxLength={2000}
          rows={4}
          className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          placeholder="Try to keep the evening session going this week — you were doing well."
        />
      </div>

      <Button type="submit" size="sm" disabled={pending} aria-busy={pending}>
        <Send aria-hidden />
        {pending ? "Sending…" : "Send message"}
      </Button>
    </form>
  );
}
