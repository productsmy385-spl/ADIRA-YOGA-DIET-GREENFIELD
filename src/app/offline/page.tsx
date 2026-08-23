import type { Metadata } from "next";

export const metadata: Metadata = { title: "Offline" };

/**
 * The offline fallback, served by the service worker when a navigation fails.
 *
 * Deliberately static and deliberately empty of data. The service worker returns this
 * INSTEAD of a cached page, because serving a cached dashboard offline would show the
 * last signed-in person's health data to whoever opens the app next on a shared device.
 *
 * So this page says what happened and nothing else. It carries no session, no name, and
 * nothing that could have come from a previous visitor.
 */
export default function OfflinePage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas px-6">
      <main className="max-w-sm text-center">
        <h1 className="type-heading text-foreground">You are offline</h1>

        <p className="mt-3 text-sm/relaxed text-muted-foreground">
          Adira needs a connection to show your practice, because your plan and your
          progress are kept on the server rather than on this device.
        </p>

        <p className="mt-3 text-sm/relaxed text-muted-foreground">
          Anything you complete while offline is not recorded. Reconnect and mark it then
          — a session recorded the next morning still counts.
        </p>
      </main>
    </div>
  );
}
