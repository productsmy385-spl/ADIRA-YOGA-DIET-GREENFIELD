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

/**
 * Reviewing access requests — an ADMINISTRATIVE capability, so organization-wide.
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
