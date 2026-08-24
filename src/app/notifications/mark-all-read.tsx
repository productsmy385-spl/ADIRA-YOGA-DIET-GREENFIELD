"use client";

import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { markAllReadAction } from "./actions";

function Pending() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" size="sm" disabled={pending} aria-busy={pending}>
      {pending ? "Marking…" : "Mark all read"}
    </Button>
  );
}

export function MarkAllReadButton() {
  return (
    <form action={markAllReadAction}>
      <Pending />
    </form>
  );
}
