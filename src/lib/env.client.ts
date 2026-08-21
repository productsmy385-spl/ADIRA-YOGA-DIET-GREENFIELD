import { z } from "zod";

/**
 * Public environment — safe to reach the browser bundle.
 *
 * Nothing secret may ever be added here. A value in this file is compiled into
 * JavaScript that anyone can read; treat every key as published.
 *
 * Next.js inlines `NEXT_PUBLIC_*` at build time by static text substitution, so each key
 * must be written out literally below. `process.env[someVariable]` would silently
 * produce `undefined` in the browser.
 */

const clientSchema = z.object({
  NEXT_PUBLIC_APP_NAME: z.string().min(1).default("Adira"),
  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
});

export const clientEnv = clientSchema.parse({
  NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
});

export type ClientEnv = z.infer<typeof clientSchema>;
