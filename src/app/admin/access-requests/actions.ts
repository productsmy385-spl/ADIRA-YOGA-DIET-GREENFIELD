"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/server/auth/guards";
import { canManageOrganization } from "@/server/authorization/permissions";
import { actorFromSession } from "@/server/authorization/member-access";
import {
  approveAccessRequest,
  rejectAccessRequest,
} from "@/server/repositories/access-requests";
import { recordAudit } from "@/server/repositories/audit-logs";
import { createNotification } from "@/server/repositories/notifications";

/**
 * Reviewing access requests — an ADMINISTRATIVE capability, so organization-wide.
 *
 * KNOWN GAP, stated rather than hidden: the approval notification is IN_APP only. The
 * person it is for cannot sign in until they activate, so it waits for them rather than
 * reaching them. Email would reach them, and outbound transactional mail beyond the OTP
 * path does not exist yet — `delivery.ts` sends one message type. Until it does, an
 * approved applicant learns by being told out of band, or by trying to sign in.
 *
 * No assignment is required to review a request, because a request is not member data:
 * nobody has become a member yet. This is the half of ADR-013 that genuinely widens, and
 * it is safe precisely because the thing being widened carries no health information.
 *
 * Scope still comes from the session (ADR-004). The organization id is never read from the
 * form, so posting another tenant's request id finds nothing — `findAccessRequest` and the
 * decision statements all carry `organization_id` in their WHERE clause, and the
 * `access_requests_reviewer_fk` composite key makes a cross-tenant reviewer
 * unrepresentable even if the application logic were wrong.
 */

export interface ReviewState {
  status: "IDLE" | "DONE" | "ERROR";
  message?: string;
}

export async function approveRequestAction(
  _previous: ReviewState,
  formData: FormData,
): Promise<ReviewState> {
  const session = await requireRole("ADMIN");

  // requireRole already proved the role; this states the capability explicitly so the
  // permission is visible at the call site rather than implied by the guard.
  const permitted = canManageOrganization(actorFromSession(session));
  if (!permitted.allowed) {
    return { status: "ERROR", message: "You do not have permission to review requests." };
  }

  const requestId = String(formData.get("requestId") ?? "");
  const notes = String(formData.get("notes") ?? "").trim() || null;

  const result = await approveAccessRequest({
    organizationId: session.organizationId,
    requestId,
    reviewerId: session.userId,
    notes,
  });

  if (!result.ok) {
    await recordAudit({
      organizationId: session.organizationId,
      actorDomain: "TENANT",
      actorId: session.userId,
      actorLabel: session.email,
      action: "access_request.approve",
      resourceType: "access_request",
      resourceId: requestId,
      outcome: "FAILURE",
      metadata: { reason: result.reason },
    });

    return {
      status: "ERROR",
      message:
        result.reason === "ALREADY_DECIDED"
          ? "That request has already been decided."
          : "That request no longer exists.",
    };
  }

  await recordAudit({
    organizationId: session.organizationId,
    actorDomain: "TENANT",
    actorId: session.userId,
    actorLabel: session.email,
    action: "access_request.approve",
    resourceType: "access_request",
    resourceId: result.request.id,
    outcome: "SUCCESS",
    // The created account's id, so the trail links request to account. No credential, and
    // no note of what the person will be sent.
    metadata: { createdUserId: result.createdUserId ?? null, role: "USER", status: "INVITED" },
  });

  /*
   * Tell the applicant.
   *
   * Deliberately AFTER the approval transaction, not inside it. A notification that fails
   * to write must not roll back an approval that succeeded — the account existing is the
   * thing that matters, and a missing notification is recoverable by telling them any
   * other way. The reverse ordering would let a transient failure here undo the decision
   * an admin just made.
   *
   * The body carries no credential, no code, and no link containing a token: it says the
   * request was approved and to sign in. Everything sensitive stays in the OTP flow.
   */
  if (result.createdUserId) {
    try {
      await createNotification({
        organizationId: session.organizationId,
        recipientId: result.createdUserId,
        senderId: session.userId,
        kind: "ACCESS_APPROVED",
        title: `Your request to join ${session.organizationName} was approved`,
        body: "Sign in with this email address to activate your account.",
        link: "/sign-in",
      });
    } catch (error) {
      // Logged, not surfaced. The approval stands.
      console.error("[access-request] approval notification failed", error);
    }
  }

  revalidatePath("/admin/access-requests");
  return { status: "DONE", message: "Approved. The account was created as invited." };
}

export async function rejectRequestAction(
  _previous: ReviewState,
  formData: FormData,
): Promise<ReviewState> {
  const session = await requireRole("ADMIN");

  const permitted = canManageOrganization(actorFromSession(session));
  if (!permitted.allowed) {
    return { status: "ERROR", message: "You do not have permission to review requests." };
  }

  const requestId = String(formData.get("requestId") ?? "");
  const notes = String(formData.get("notes") ?? "").trim() || null;

  const result = await rejectAccessRequest({
    organizationId: session.organizationId,
    requestId,
    reviewerId: session.userId,
    notes,
  });

  if (!result.ok) {
    return {
      status: "ERROR",
      message:
        result.reason === "ALREADY_DECIDED"
          ? "That request has already been decided."
          : "That request no longer exists.",
    };
  }

  await recordAudit({
    organizationId: session.organizationId,
    actorDomain: "TENANT",
    actorId: session.userId,
    actorLabel: session.email,
    action: "access_request.reject",
    resourceType: "access_request",
    resourceId: requestId,
    outcome: "SUCCESS",
    metadata: { accountCreated: false },
  });

  revalidatePath("/admin/access-requests");
  return { status: "DONE", message: "Rejected. No account was created." };
}
