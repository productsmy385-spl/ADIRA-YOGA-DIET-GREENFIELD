import { resolveMemberAccess, actorFromSession } from "@/server/authorization/member-access";
import { canManageProgrammes } from "@/server/authorization/permissions";
import type { TenantSessionContext } from "@/server/repositories/sessions";
import type { MediaPurpose } from "@/server/repositories/media";

/**
 * Who may upload what.
 *
 * Media splits cleanly in two, and the two halves are governed by different questions:
 *
 *   exercise, meal    LIBRARY content, shared by the whole organization. The question is
 *                     administrative — may this person shape the organization's content?
 *
 *   progress_photo,   Media ABOUT AN IDENTIFIABLE MEMBER, and therefore health data. The
 *   avatar            question is data reach over that one member, which under ADR-013 is
 *                     assignment-scoped for an ADMIN and self-only for a USER.
 *
 * Conflating them is the mistake this file exists to prevent: `requireRole("ADMIN")` is
 * the right gate for an exercise illustration and completely the wrong one for a progress
 * photo, because passing it says the caller may administer the organization — never that
 * they may see this member's body.
 *
 * The decision is made once, here, and both the authorisation endpoint and the recording
 * endpoint call it. An upload authorised for one member must not be recordable against
 * another, so the same check runs at both ends rather than being trusted from the first.
 */

const LIBRARY_PURPOSES: ReadonlySet<MediaPurpose> = new Set(["exercise", "meal"]);

export type UploadDenial =
  | "NOT_PERMITTED"
  | "MEMBER_REQUIRED"
  | "MEMBER_NOT_ALLOWED"
  | "UNKNOWN_MEMBER";

export type UploadDecision =
  | { allowed: true; customerId: string | null }
  | { allowed: false; reason: UploadDenial };

export async function decideUpload(
  session: TenantSessionContext,
  purpose: MediaPurpose,
  customerId: string | null,
): Promise<UploadDecision> {
  if (LIBRARY_PURPOSES.has(purpose)) {
    const decision = canManageProgrammes(actorFromSession(session));
    if (!decision.allowed) return { allowed: false, reason: "NOT_PERMITTED" };

    // Library media belongs to the organization, not to a person. Silently dropping a
    // supplied customer id rather than honouring it means a caller cannot smuggle a
    // member association past the administrative check.
    return { allowed: true, customerId: null };
  }

  if (!customerId) return { allowed: false, reason: "MEMBER_REQUIRED" };

  const access = await resolveMemberAccess(actorFromSession(session), customerId);
  if (!access.memberExists) return { allowed: false, reason: "UNKNOWN_MEMBER" };
  if (!access.decision.allowed) return { allowed: false, reason: "MEMBER_NOT_ALLOWED" };

  return { allowed: true, customerId };
}

/**
 * What the caller is told.
 *
 * `UNKNOWN_MEMBER` and `MEMBER_NOT_ALLOWED` deliberately produce the SAME message and the
 * same status. The difference between "no such member" and "a member you may not touch"
 * is exactly the fact an attacker is probing for, and answering it turns the endpoint
 * into a membership oracle for another consultant's caseload.
 */
export function denialResponse(reason: UploadDenial): { status: number; error: string } {
  switch (reason) {
    case "MEMBER_REQUIRED":
      return { status: 400, error: "This kind of upload must name a member." };
    case "NOT_PERMITTED":
      return { status: 403, error: "You do not have permission to upload this." };
    case "UNKNOWN_MEMBER":
    case "MEMBER_NOT_ALLOWED":
      return { status: 404, error: "That member was not found." };
  }
}
