"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requirePlatformSession } from "@/server/auth/guards";
import { isUniqueViolation } from "@/server/db/unique-violation";
import { recordAudit } from "@/server/repositories/audit-logs";
import {
  createOrganization,
  findOrganizationById,
  setOrganizationStatus,
} from "@/server/repositories/organizations";
import { createUser, findUserById, setUserStatus } from "@/server/repositories/users";

/**
 * Platform operator write actions — the PLATFORM identity domain (ADR-001).
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHAT A SUPER_ADMIN MAY DO, AND THE LINE THIS FILE MUST NOT CROSS
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * A platform account administers ORGANIZATIONS and the ADMINISTRATORS inside them. It
 * provisions tenants, provisions their first administrator, and suspends either. That is
 * the whole remit.
 *
 * It gets NO reach into member health data — not by these actions, not as a side effect,
 * not "temporarily". `canAccessMemberData` denies a platform actor unconditionally, and
 * nothing here goes near activities, check-ins, reports or assignments. Creating an ADMIN
 * grants that ADMIN nothing either: a new administrator has no `consultant_assignments`,
 * so under ADR-013 they can administer the organisation and read nobody's practice until
 * somebody is assigned to them.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THE ONE PLACE `organizationId` LEGITIMATELY COMES FROM THE REQUEST
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * ADR-004 says tenant scope comes from the session. A platform session has NO organization
 * — that absence is the platform boundary — so "which tenant" has to be a parameter here,
 * and there is no session field to take it from.
 *
 * That makes the validation load-bearing rather than decorative: every action below
 * resolves the organization and refuses if it does not exist. The protection is not "the
 * id came from a trusted place", it is "this account is authorised over every tenant, and
 * the id names a real one". Those are different guarantees and only the second is
 * available here.
 *
 * Every action is audited with `actorDomain: "PLATFORM"`, so tenant-domain and
 * platform-domain activity stay distinguishable in one trail.
 */

const organizationSchema = z.object({
  name: z.string().trim().min(1).max(200),
  // Lower-cased and hyphen-safe: it appears in URLs and is unique across the platform.
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lower-case letters, numbers and hyphens."),
  timezone: z.string().trim().min(1).max(64).default("Asia/Kolkata"),
  locale: z.enum(["en", "hi", "te"]).default("en"),
});

const adminSchema = z.object({
  organizationId: z.uuid(),
  email: z.string().trim().toLowerCase().pipe(z.email()),
  fullName: z.string().trim().min(1).max(200),
  locale: z.enum(["en", "hi", "te"]).default("en"),
});

export interface PlatformState {
  status: "IDLE" | "DONE" | "ERROR";
  message?: string;
  fieldErrors?: Record<string, string>;
}

/* ── organizations ─────────────────────────────────────────────────────── */

export async function createOrganizationAction(
  _previous: PlatformState,
  formData: FormData,
): Promise<PlatformState> {
  const session = await requirePlatformSession();

  const parsed = organizationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      status: "ERROR",
      message: "Check the form and try again.",
      fieldErrors: {
        [String(issue?.path[0] ?? "name")]: issue?.message ?? "That value is not valid.",
      },
    };
  }

  try {
    const organization = await createOrganization({
      name: parsed.data.name,
      slug: parsed.data.slug,
      timezone: parsed.data.timezone,
      locale: parsed.data.locale,
      // Deliberately not set. A join code opens a self-registration route, and a tenant
      // should turn that on knowingly rather than inherit it from a default.
      joinCode: null,
    });

    await recordAudit({
      organizationId: organization.id,
      actorDomain: "PLATFORM",
      actorId: session.ownerAccountId,
      actorLabel: session.email,
      action: "organization.create",
      resourceType: "organization",
      resourceId: organization.id,
      outcome: "SUCCESS",
      metadata: { slug: organization.slug },
    });

    revalidatePath("/super-admin");
    return {
      status: "DONE",
      message: `${organization.name} created. Add its first administrator next.`,
    };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return {
        status: "ERROR",
        message: "That slug is already taken.",
        fieldErrors: { slug: "Already in use." },
      };
    }
    throw error;
  }
}

export async function setOrganizationStatusAction(formData: FormData): Promise<void> {
  const session = await requirePlatformSession();

  const organizationId = String(formData.get("organizationId") ?? "");
  const status = String(formData.get("status") ?? "");

  if (!["ACTIVE", "SUSPENDED", "CLOSED"].includes(status)) return;

  const organization = await findOrganizationById(organizationId);
  if (!organization) return;

  await setOrganizationStatus(organizationId, status as "ACTIVE" | "SUSPENDED" | "CLOSED");

  await recordAudit({
    organizationId,
    actorDomain: "PLATFORM",
    actorId: session.ownerAccountId,
    actorLabel: session.email,
    action: "organization.status",
    resourceType: "organization",
    resourceId: organizationId,
    outcome: "SUCCESS",
    metadata: { from: organization.status, to: status },
  });

  /*
   * Suspending an organization ends its people's access at the next request, not at some
   * cleanup job: `TENANT_SESSION_SELECT` joins `organizations` and requires
   * `o.status = 'ACTIVE'`, so a live session stops resolving the moment this commits.
   * Nothing is deleted — suspension is reversible, and a suspended tenant's data is still
   * theirs.
   */
  revalidatePath("/super-admin");
}

/* ── administrators ────────────────────────────────────────────────────── */

export async function createAdminAction(
  _previous: PlatformState,
  formData: FormData,
): Promise<PlatformState> {
  const session = await requirePlatformSession();

  const parsed = adminSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      status: "ERROR",
      message: "Check the form and try again.",
      fieldErrors: {
        [String(issue?.path[0] ?? "email")]: "That value is not valid.",
      },
    };
  }

  // See the header: the id is a parameter here because a platform session has no
  // organization, so it is validated rather than trusted.
  const organization = await findOrganizationById(parsed.data.organizationId);
  if (!organization) {
    return { status: "ERROR", message: "That organisation does not exist." };
  }

  try {
    const admin = await createUser({
      organizationId: organization.id,
      email: parsed.data.email,
      fullName: parsed.data.fullName,
      locale: parsed.data.locale,
      /*
       * ADMIN — the role a tenant cannot grant itself.
       *
       * `canAssignRole` refuses ADMIN→ADMIN because peers cannot promote each other, so
       * provisioning an administrator has to happen from outside the tenant. This is that
       * path, and it is why it lives in the platform domain rather than being a flag on
       * the tenant-facing add-member form.
       */
      role: "ADMIN",
      // Invited, like every other account. The platform operator does not activate
      // anybody: the administrator proves control of the address by signing in.
      status: "INVITED",
    });

    await recordAudit({
      organizationId: organization.id,
      actorDomain: "PLATFORM",
      actorId: session.ownerAccountId,
      actorLabel: session.email,
      action: "admin.provision",
      resourceType: "user",
      resourceId: admin.id,
      outcome: "SUCCESS",
      // Provisioning an administrator is the most privileged thing this console does, so
      // the trail records the grant explicitly rather than leaving it to be inferred.
      metadata: { role: "ADMIN", status: "INVITED", organizationSlug: organization.slug },
    });

    revalidatePath("/super-admin");
    return {
      status: "DONE",
      message: `${admin.fullName} invited as an administrator of ${organization.name}. They activate by signing in.`,
    };
  } catch (error) {
    if (isUniqueViolation(error, "users_email_unique_per_org")) {
      return {
        status: "ERROR",
        message: "That address already belongs to somebody in this organisation.",
        fieldErrors: { email: "Already a member there." },
      };
    }
    throw error;
  }
}

export async function setAdminStatusAction(formData: FormData): Promise<void> {
  const session = await requirePlatformSession();

  const userId = String(formData.get("userId") ?? "");
  const organizationId = String(formData.get("organizationId") ?? "");
  const status = String(formData.get("status") ?? "");

  if (!["ACTIVE", "SUSPENDED"].includes(status)) return;

  const organization = await findOrganizationById(organizationId);
  if (!organization) return;

  // The user must belong to the organization named, or a posted pair could suspend
  // somebody in a different tenant than the row being displayed.
  const user = await findUserById(userId, organizationId);
  if (!user) return;

  /*
   * Only administrators. A platform operator suspending a MEMBER would be acting on a
   * person inside a tenant rather than on the tenant's administration — closer to
   * touching member data than to platform operations, and not something this console
   * should be able to do by posting a different id.
   */
  if (user.role !== "ADMIN" && user.role !== "ORG_OWNER") return;

  await setUserStatus(userId, organizationId, status as "ACTIVE" | "SUSPENDED");

  await recordAudit({
    organizationId,
    actorDomain: "PLATFORM",
    actorId: session.ownerAccountId,
    actorLabel: session.email,
    action: "admin.status",
    resourceType: "user",
    resourceId: userId,
    outcome: "SUCCESS",
    metadata: { from: user.status, to: status, role: user.role },
  });

  revalidatePath("/super-admin");
}
