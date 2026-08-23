"use server";

import { headers } from "next/headers";

import { submitAccessRequest } from "@/server/auth/access-request";

/**
 * The public access-request submission.
 *
 * Unauthenticated, so everything the caller sends is untrusted — including the join code,
 * which is resolved server-side and never echoed back. There is deliberately no field for
 * an organization id and none for a role.
 */

async function requestContext() {
  const headerList = await headers();

  // Behind Railway's proxy the LAST x-forwarded-for entry is the one Railway appended and
  // the only trustworthy one. Taking the first — the usual snippet — takes whatever the
  // client put there and makes the per-IP rate limit meaningless.
  const forwarded = headerList.get("x-forwarded-for");
  const ip = forwarded
    ? (forwarded.split(",").pop()?.trim() ?? null)
    : headerList.get("x-real-ip");

  return { ip: ip || null, userAgent: headerList.get("user-agent") };
}

export interface RequestAccessState {
  status: "IDLE" | "SUBMITTED" | "ERROR";
  fields?: Record<string, string>;
  message?: string;
  /** Echoed so the form can repopulate without losing what was typed. */
  values?: { joinCode: string; fullName: string; email: string; phone: string; reason: string };
}

export async function requestAccessAction(
  _previous: RequestAccessState,
  formData: FormData,
): Promise<RequestAccessState> {
  const values = {
    joinCode: String(formData.get("joinCode") ?? "").trim(),
    fullName: String(formData.get("fullName") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim(),
    phone: String(formData.get("phone") ?? "").trim(),
    reason: String(formData.get("reason") ?? "").trim(),
  };

  const context = await requestContext();

  const result = await submitAccessRequest({
    joinCode: values.joinCode,
    fullName: values.fullName,
    email: values.email,
    phone: values.phone || null,
    reason: values.reason || null,
    ...context,
  });

  if (!result.ok) {
    if (result.reason === "INVALID_INPUT") {
      return { status: "ERROR", fields: result.fields, values };
    }

    return {
      status: "ERROR",
      message: `Too many attempts. Try again in ${Math.ceil(
        result.retryAfterSeconds / 60,
      )} minutes.`,
      values,
    };
  }

  /*
   * The same confirmation whether or not the join code was real.
   *
   * "If the code is valid" is doing the work: it is true either way, and it sets the
   * expectation that nothing may arrive — without confirming which case this was. Saying
   * "your request was sent" would be a lie half the time, and "no such organisation" is
   * the tenant-enumeration leak this whole path is shaped to avoid.
   */
  return { status: "SUBMITTED" };
}
