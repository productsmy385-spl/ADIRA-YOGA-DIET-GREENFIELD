import type { Metadata } from "next";
import Link from "next/link";
import { Bell, BellOff } from "lucide-react";

import { AppNav, MobileTabBar } from "@/components/nav/app-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireTenantSession } from "@/server/auth/guards";
import { listNotifications } from "@/server/repositories/notifications";

import { markReadAction } from "./actions";
import { MarkAllReadButton } from "./mark-all-read";

export const metadata: Metadata = { title: "Notifications" };
export const dynamic = "force-dynamic";

/**
 * A member's own notifications.
 *
 * `listNotifications` takes `(organizationId, recipientId)` and both come from the
 * session, never from the URL — there is no id in this route to tamper with, which is the
 * cheapest possible defence against reading someone else's notifications (ADR-004).
 *
 * Nothing here is filtered client-side. The query returns only this recipient's rows.
 */

function timeAgo(value: Date): string {
  const minutes = Math.round((Date.now() - value.getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return value.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export default async function NotificationsPage() {
  const session = await requireTenantSession();
  const notifications = await listNotifications(session.organizationId, session.userId, 50);
  const unread = notifications.filter((n) => n.readAt === null).length;

  return (
    <div className="min-h-dvh bg-background">
      <AppNav role={session.role} currentPath="/notifications" />

      <main className="mx-auto max-w-2xl px-6 py-10 pb-28 sm:pb-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Notifications
            </h1>
            {unread > 0 ? (
              <p className="mt-1 text-sm text-muted-foreground">{unread} unread</p>
            ) : null}
          </div>

          {unread > 0 ? <MarkAllReadButton /> : null}
        </div>

        {notifications.length === 0 ? (
          <div className="mt-8 rounded-xl border border-dashed border-border p-10 text-center">
            <BellOff className="mx-auto size-8 text-muted-foreground" aria-hidden />
            <p className="mt-4 text-sm text-muted-foreground">
              Nothing yet. Reminders, plan changes, and results appear here.
            </p>
          </div>
        ) : (
          <ul className="mt-8 space-y-3">
            {notifications.map((n) => {
              const isUnread = n.readAt === null;

              const card = (
                <div
                  className={`rounded-xl border p-4 transition-colors ${
                    isUnread
                      ? "border-primary/40 bg-card"
                      : "border-border bg-card/60"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <Bell
                      className={`mt-0.5 size-4 shrink-0 ${
                        isUnread ? "text-primary" : "text-muted-foreground"
                      }`}
                      aria-hidden
                    />

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-medium text-card-foreground">{n.title}</h2>
                        {/* Unread is stated in words as well as colour — status must never
                            be conveyed by colour alone. */}
                        {isUnread ? (
                          <Badge variant="secondary" className="text-xs">
                            Unread
                          </Badge>
                        ) : null}
                      </div>

                      {n.body ? (
                        <p className="mt-1 text-sm/relaxed text-muted-foreground">{n.body}</p>
                      ) : null}

                      <p className="mt-2 text-xs text-muted-foreground">
                        {n.senderName ? `${n.senderName} · ` : ""}
                        {timeAgo(n.createdAt)}
                      </p>
                    </div>
                  </div>
                </div>
              );

              /*
                Dismissing ONE notification, outside the link.
                It sits beside the card rather than inside it because a form nested in an
                anchor is invalid HTML, and because "open this" and "clear this" are
                genuinely different intentions — collapsing them would mean a member could
                not keep something marked unread after looking at it.
              */
              const dismiss = isUnread ? (
                <form action={markReadAction} className="mt-1 flex justify-end">
                  <input type="hidden" name="notificationId" value={n.id} />
                  <Button type="submit" size="xs" variant="ghost">
                    Mark read
                  </Button>
                </form>
              ) : null;

              return (
                <li key={n.id}>
                  {n.link ? (
                    <Link
                      href={n.link}
                      className="block rounded-xl focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                    >
                      {card}
                    </Link>
                  ) : (
                    card
                  )}
                  {dismiss}
                </li>
              );
            })}
          </ul>
        )}
      </main>

      <MobileTabBar role={session.role} currentPath="/notifications" />
    </div>
  );
}
