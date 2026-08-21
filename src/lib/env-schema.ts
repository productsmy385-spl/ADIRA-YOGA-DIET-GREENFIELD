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

    // ---- Phase 2+ integrations. Optional until the phase that implements them. ----

    /** Resend API key for OTP delivery. Phase 2. */
    RESEND_API_KEY: z.string().startsWith("re_").optional(),
    /** From-address for transactional mail. Phase 2. */
    OTP_FROM_EMAIL: z.email().optional(),

    /** ImageKit credentials. Phase 12. */
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
