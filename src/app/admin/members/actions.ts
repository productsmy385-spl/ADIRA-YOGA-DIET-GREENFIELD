"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireRole } from "@/server/auth/guards";
import { actorFromSession } from "@/server/authorization/member-access";
import { canAssignRole, canManageOrganization } from "@/server/authorization/permissions";
import { isUniqueViolation } from "@/server/db/unique-violation";
import { recordAudit } from "@/server/repositories/audit-logs";
import { createUser } from "@/server/repositories/users";

/**
 * Adding one member.
 *
 * The single-member counterpart to the CSV import, and it makes the same three promises:
 * the role is not a parameter, the account starts INVITED, and the organization comes from
 * the session.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THIS FORM CANNOT CREATE AN ADMIN
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `canAssignRole` requires the actor to STRICTLY outrank the role being granted, so an
 * ADMIN granting ADMIN is refused — peers cannot promote each other (ADR-013). That is not
 * a limitation to work around here: an organization gaining a second administrator is a
 * privilege escalation, and it belongs to a deliberate, separately audited path rather than
 * to the everyday "add a member" form.
 *
 * The check is written out even though `role` is hardcoded to `USER`, so that if this form
 * ever grows a role field the rank rule is already the gate rather than something to
 * remember to add.
 *
 * ACTIVATION IS NOT OUR JOB. The account is created INVITED and stays that way until the
 * person proves they control the address — `sign-in.ts` promotes INVITED to ACTIVE on a
 * verified OTP, with purpose ACCOUNT_ACTIVATION. So no credential is generated here, none
 * is emailed, and there is no activation link to leak. The invitation IS the row.
 */

const schema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  fullName: z.string().trim().min(1).max(200),
  phone: z
    .string()
    .trim()
    .max(40)
    .optional()
    .transform((value) => (value ? value : null)),
  locale: z.enum(["en", "hi", "te"]).default("en"),
});

export interface AddMemberState {
  status: "IDLE" | "DONE" | "ERROR";
  message?: string;
  /** Field-level problems, keyed by field, so the form can point at what to fix. */
  fieldErrors?: Partial<Record<"email" | "fullName" | "phone" | "locale", string>>;
}

export async function addMemberAction(
  _previous: AddMemberState,
  formData: FormData,
): Promise<AddMemberState> {
  const session = await requireRole("ADMIN");
  const actor = actorFromSession(session);

  if (!canManageOrganization(actor).allowed) {
    return { status: "ERROR", message: "You do not have permission to add members." };
  }

  // See the header: hardcoded to USER, checked anyway.
  if (!canAssignRole(actor, "USER").allowed) {
    return { status: "ERROR", message: "You do not have permission to create accounts." };
  }

  const parsed = schema.safeParse({
    email: formData.get("email") ?? "",
    fullName: formData.get("fullName") ?? "",
    phone: formData.get("phone") ?? "",
    locale: formData.get("locale") ?? "en",
  });

  if (!parsed.success) {
    const fieldErrors: AddMemberState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (field === "email") fieldErrors.email = "Enter a valid email address.";
      if (field === "fullName") fieldErrors.fullName = "Enter the person's full name.";
      if (field === "phone") fieldErrors.phone = "That phone number is too long.";
      if (field === "locale") fieldErrors.locale = "Choose a supported language.";
    }
    return { status: "ERROR", message: "Check the form and try again.", fieldErrors };
  }

  const { email, fullName, phone, locale } = parsed.data;

  try {
    const created = await createUser({
      // From the session, never the form (ADR-004).
      organizationId: session.organizationId,
      email,
      fullName,
      phone,
      locale,
      role: "USER",
      // Explicit rather than relying on the repository default: "an added member cannot
      // sign in until they activate" is a security property, and it should be visible at
      // the call site that decides it.
      status: "INVITED",
    });

    await recordAudit({
      organizationId: session.organizationId,
      actorDomain: "TENANT",
      actorId: session.userId,
      actorLabel: session.email,
      action: "member.create",
      resourceType: "user",
      resourceId: created.id,
      outcome: "SUCCESS",
      // No phone, no name — the row already holds those, and an audit trail that
      // duplicates personal data outlives the account it describes.
      metadata: { role: "USER", status: "INVITED" },
    });

    revalidatePath("/admin/members");

    return {
      status: "DONE",
      message: `${fullName} has been invited. They activate the account by signing in with ${email}.`,
    };
  } catch (error) {
    /*
     * A duplicate address is the expected collision, and the message says so plainly.
     *
     * `users_email_unique_per_org` is scoped per organization on purpose: the same person
     * can be a customer of one studio and a consultant at another. So this tells the admin
     * the address is taken HERE, which is information they are entitled to — they
     * administer this organization — and reveals nothing about any other tenant.
     */
    if (isUniqueViolation(error, "users_email_unique_per_org")) {
      await recordAudit({
        organizationId: session.organizationId,
        actorDomain: "TENANT",
        actorId: session.userId,
        actorLabel: session.email,
        action: "member.create",
        outcome: "FAILURE",
        metadata: { reason: "DUPLICATE_EMAIL" },
      });

      return {
        status: "ERROR",
        message: "Somebody with that email address is already a member here.",
        fieldErrors: { email: "Already a member of this organisation." },
      };
    }

    throw error;
  }
}
