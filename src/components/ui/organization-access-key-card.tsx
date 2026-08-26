"use client";

import { useState } from "react";
import { Check, Copy, KeyRound, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/glass/glass";

interface OrganizationAccessKeyCardProps {
  joinCode: string | null;
  onRegenerateAction?: () => Promise<unknown>;
}

export function OrganizationAccessKeyCard({
  joinCode,
  onRegenerateAction,
}: OrganizationAccessKeyCardProps) {
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  const displayCode = joinCode || "ADIRA-7X4K";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(displayCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback if clipboard API is restricted
    }
  };

  const handleRegenerate = async () => {
    if (!onRegenerateAction) return;
    if (!confirm("Are you sure you want to regenerate the organization access code? The existing code will no longer be valid for new registration requests.")) {
      return;
    }
    try {
      setLoading(true);
      await onRegenerateAction();
    } finally {
      setLoading(false);
    }
  };

  return (
    <GlassCard className="p-6 my-6 border border-border/80 bg-card/90 shadow-sm backdrop-blur-md">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 font-semibold text-card-foreground">
            <KeyRound className="size-4 text-primary" aria-hidden />
            <span>Organization Access Code</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Members use this code to request access to your organization during registration.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-1.5 font-mono text-sm font-bold tracking-wider text-foreground">
            <span>{displayCode}</span>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={handleCopy}
              className="size-7 p-0 text-muted-foreground hover:text-foreground"
              title="Copy code"
            >
              {copied ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
              <span className="sr-only">Copy</span>
            </Button>
          </div>

          {onRegenerateAction ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleRegenerate}
              disabled={loading}
              className="gap-1.5 text-xs"
            >
              <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
              Regenerate
            </Button>
          ) : null}
        </div>
      </div>
    </GlassCard>
  );
}
