import { z } from "zod";

/**
 * The server environment contract — pure, side-effect free, and therefore testable.
 *
 * `env.ts` is the module that actually reads `process.env` and throws. This file only
 * describes what valid configuration looks like, so `env-schema.test.ts` can exercise
 * every rule without needing a valid environment to import it.
 */

export const serverSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

    /** Railway PostgreSQL connection string. Load-bearing for every request. */
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),

    /**
     * Optional CA certificate for full TLS verification of the database connection.
     * Railway's certificates do not chain to a public CA, so verification is off unless
     * this is supplied — connections are encrypted either way.
     */
    DATABASE_CA_CERT: z.string().optional(),

    /**
     * Signing secret for TENANT sessions (org owner, admin, customer).
     * Distinct from the platform-owner secret below: two identity domains, two secrets,
     * so a leak of one cannot be replayed against the other.
     */
    SESSION_SECRET: z
      .string()
      .min(32, "must be at least 32 characters of high-entropy random data"),

    /** Signing secret for PLATFORM OWNER sessions. */
    OWNER_SESSION_SECRET: z.string().min(32, "must be at least 32 characters"),

    /** Bearer token Railway Cron presents to /api/cron/* routes. */
    CRON_SECRET: z.string().min(32, "must be at least 32 characters"),

    /** Absolute origin, used for WebAuthn relying-party checks and absolute links. */
    APP_URL: z.url(),

    /**
     * Clerk — proves identity and sends invitations (ADR-015). Required, and checked here
     * rather than left to Clerk's own runtime error: authentication must fail closed at
     * boot, never degrade into "nobody can sign in" discovered by a customer.
     */
    CLERK_SECRET_KEY: z.string().startsWith("sk_", "must be a Clerk secret key (sk_…)"),
    /**
     * Not secret — it is also inlined into the browser bundle — but validated on the server
     * because the proxy derives the CSP's Clerk origin from it.
     */
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z
      .string()
      .startsWith("pk_", "must be a Clerk publishable key (pk_…)"),

    /**
     * ImageKit credentials. Phase 12.
     *
     * The PUBLIC key is not secret — the browser needs it to address the upload API — but
     * it lives here rather than in `env.client.ts` on purpose. `NEXT_PUBLIC_*` is inlined
     * at BUILD time, so a build would be pinned to one ImageKit account and staging could
     * not differ from production without a rebuild. Handing it to the client in the
     * upload-auth response keeps it a runtime value.
     */
    IMAGEKIT_PUBLIC_KEY: z.string().optional(),
    IMAGEKIT_PRIVATE_KEY: z.string().optional(),
    IMAGEKIT_URL_ENDPOINT: z.url().optional(),
  })
  .superRefine((value, ctx) => {
    // Two identity domains means two independent secrets. Reusing one collapses the
    // boundary ADR-001 exists to draw: a stolen tenant session cookie could then be
    // re-signed as a platform-owner cookie. Cheap to check, catastrophic to miss.
    if (value.SESSION_SECRET === value.OWNER_SESSION_SECRET) {
      ctx.addIssue({
        code: "custom",
        path: ["OWNER_SESSION_SECRET"],
        message:
          "must differ from SESSION_SECRET — identical secrets collapse the tenant and " +
          "platform identity domains into one (see decisions/ADR-001)",
      });
    }
  });

export type ServerEnv = z.infer<typeof serverSchema>;

/**
 * Validate an environment source. Returns the parsed config or throws an Error naming
 * every problem at once — fixing configuration one error per restart is miserable.
 *
 * The message reports keys and reasons only. It must never echo a value, because this
 * error reaches deploy logs.
 */
export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const parsed = serverSchema.safeParse(source);

  if (parsed.success) return parsed.data;

  const problems = parsed.error.issues
    .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("\n");

  throw new Error(
    `Invalid server environment. ${parsed.error.issues.length} problem(s) found:\n${problems}\n\n` +
      `See .env.example for the expected keys, and docs/RAILWAY.md for where each is set.`,
  );
}
