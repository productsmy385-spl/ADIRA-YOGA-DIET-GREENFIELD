import { ClerkProvider } from "@clerk/nextjs";

import { branding } from "@/lib/branding";

/**
 * The frame every sign-in surface shares, and the only place Clerk's browser SDK loads.
 *
 * ClerkProvider is scoped to these pages rather than the root layout on purpose: the rest
 * of Adira authenticates through its OWN session cookie (ADR-015), so loading Clerk's
 * script on a member's dashboard would cost every page load for nothing.
 *
 * `dynamic` makes Clerk read the per-request CSP nonce that proxy.ts puts on the request
 * header, so its script runs under the existing nonce policy — no 'unsafe-inline'.
 *
 * Colours are semantic tokens through CSS variables (invariant 7: no hex in src/).
 */
export const clerkAppearance = {
  variables: {
    colorPrimary: "var(--primary)",
    colorBackground: "var(--card)",
    colorForeground: "var(--card-foreground)",
    colorMutedForeground: "var(--muted-foreground)",
    colorInput: "var(--background)",
    colorInputForeground: "var(--foreground)",
    colorBorder: "var(--border)",
    colorDanger: "var(--destructive)",
    borderRadius: "0.75rem",
    fontFamily: "var(--font-sans)",
  },
  elements: {
    rootBox: "w-full",
    cardBox: "w-full shadow-none",
  },
} as const;

export function AuthShell({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <ClerkProvider dynamic appearance={clerkAppearance}>
      <div className="flex min-h-dvh items-center justify-center bg-background px-6 py-12">
        <main className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center text-center">
            {/* eslint-disable-next-line @next/next/no-img-element -- static mark, nothing to optimise */}
            <img src={branding.icons.mark} alt="" aria-hidden className="size-10 mix-blend-multiply" />
            <h1 className="mt-4 text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
            {description ? (
              <p className="mt-2 text-sm text-muted-foreground">{description}</p>
            ) : null}
          </div>

          {children}

          {footer}
        </main>
      </div>
    </ClerkProvider>
  );
}
