"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

/**
 * Service worker registration and the update prompt.
 *
 * Registration is deferred until after load. A worker registering during hydration
 * competes for the main thread with the page the customer is waiting for, and the daily
 * loop is the thing that must feel fast.
 *
 * THE UPDATE IS OFFERED, NOT FORCED. Reloading underneath someone mid-check-in would
 * discard what they typed. The prompt appears; they choose when.
 */

export function ServiceWorkerRegistrar() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // In development the worker would cache build output that changes on every edit and
    // produce failures that look like application bugs.
    if (process.env.NODE_ENV !== "production") return;

    let cancelled = false;

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js");
        if (cancelled) return;

        // A worker already waiting means the tab was opened after a deploy.
        if (registration.waiting) setWaiting(registration.waiting);

        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (!installing) return;

          installing.addEventListener("statechange", () => {
            // `controller` present means this is an UPDATE rather than a first install.
            // Prompting on first install would ask someone to reload a page they just
            // opened, for a version they are already running.
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              setWaiting(installing);
            }
          });
        });
      } catch {
        // A failed registration must not break the app. The product works without a
        // service worker; it simply has no offline page.
      }
    };

    if (document.readyState === "complete") void register();
    else window.addEventListener("load", () => void register(), { once: true });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!waiting) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-20 z-40 mx-auto flex max-w-md items-center gap-3 rounded-xl border border-border-glass bg-surface-glass-strong p-4 backdrop-blur-panel sm:bottom-4"
    >
      <p className="flex-1 text-sm text-surface-foreground">
        A new version of Adira is ready.
      </p>
      <Button
        size="sm"
        onClick={() => {
          waiting.postMessage("SKIP_WAITING");
          // Reload once the new worker takes control, rather than immediately — an
          // immediate reload can land before activation and serve the old version again.
          navigator.serviceWorker.addEventListener(
            "controllerchange",
            () => window.location.reload(),
            { once: true },
          );
        }}
      >
        Update
      </Button>
    </div>
  );
}

/**
 * The install prompt.
 *
 * Chromium fires `beforeinstallprompt` and lets the page defer it; iOS Safari does not,
 * and installing there is a manual Share → Add to Home Screen. So this renders only where
 * the event actually fires, rather than showing an "Install" button that does nothing on
 * an iPhone — a button that silently fails is worse than no button.
 */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallButton({ className }: { className?: string }) {
  const [deferred, setDeferred] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault(); // Keep it; show our own affordance instead of the banner.
      setDeferred(event as InstallPromptEvent);
    };

    const onInstalled = () => setDeferred(null);

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!deferred) return null;

  return (
    <Button
      variant="outline"
      size="sm"
      className={className}
      onClick={async () => {
        await deferred.prompt();
        await deferred.userChoice;
        // The event is single-use; a second prompt() throws.
        setDeferred(null);
      }}
    >
      Install app
    </Button>
  );
}
