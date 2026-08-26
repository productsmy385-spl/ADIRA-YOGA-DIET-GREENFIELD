import type { Metadata } from "next";
import Link from "next/link";

import { branding } from "@/lib/branding";

import { RequestAccessForm } from "./request-form";

export const metadata: Metadata = { title: "Request access" };

/**
 * Public, unauthenticated, and deliberately incurious.
 *
 * The page renders the same for everyone. It performs no lookup on load, reveals no
 * organisation, and has no variant keyed to a code — a page that changed appearance for a
 * valid code would be an enumeration oracle before the form was even submitted.
 */
export const dynamic = "force-dynamic";

export default function RequestAccessPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-6 py-12">
      <main className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- static mark */}
          <img src={branding.icons.mark} alt="" aria-hidden className="size-10 mix-blend-multiply" />
          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-foreground">
            Request access to {branding.name}
          </h1>
          <p className="mt-2 text-sm/relaxed text-muted-foreground">
            Adira is private software. Your organisation reviews every request.
          </p>
        </div>

        <RequestAccessForm />

        <p className="mt-8 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/sign-in" className="text-foreground underline underline-offset-4">
            Sign in
          </Link>
        </p>
      </main>
    </div>
  );
}
