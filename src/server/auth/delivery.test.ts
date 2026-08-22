import { describe, expect, it } from "vitest";

import {
  ConsoleDeliveryAdapter,
  createDeliveryAdapter,
  renderOtpEmail,
  type OtpMessage,
} from "./delivery";

const message: OtpMessage = {
  to: "person@example.com",
  code: "483920",
  expiresInMinutes: 10,
  purpose: "ACCOUNT_RECOVERY",
};

describe("renderOtpEmail", () => {
  it("includes the code and the expiry", () => {
    const { text } = renderOtpEmail(message);
    expect(text).toContain("483920");
    expect(text).toContain("10 minutes");
  });

  // An unexpected recovery code is precisely the signal that someone is attacking the
  // account. A message that does not say what the code is for gives the recipient no way
  // to notice.
  it("states what the code is for, per purpose", () => {
    expect(renderOtpEmail({ ...message, purpose: "ACCOUNT_RECOVERY" }).text).toContain(
      "recover access to your account",
    );
    expect(renderOtpEmail({ ...message, purpose: "NEW_DEVICE" }).text).toContain(
      "sign in on a new device",
    );
    expect(renderOtpEmail({ ...message, purpose: "STEP_UP" }).text).toContain(
      "confirm a sensitive action",
    );
  });

  it("gives each purpose a distinct subject", () => {
    const purposes = [
      "ACCOUNT_ACTIVATION",
      "ACCOUNT_RECOVERY",
      "NEW_DEVICE",
      "STEP_UP",
    ] as const;
    const subjects = purposes.map((p) => renderOtpEmail({ ...message, purpose: p }).subject);
    expect(new Set(subjects).size).toBe(purposes.length);
  });

  it("warns that nobody will ask for the code", () => {
    expect(renderOtpEmail(message).text).toContain("nobody from");
  });

  it("reassures that no change has been made", () => {
    // Someone who did not request this needs to know they can safely ignore it,
    // otherwise the rational response is to panic and start changing things.
    expect(renderOtpEmail(message).text).toContain("no change has been made");
  });
});

describe("createDeliveryAdapter", () => {
  it("returns the Resend driver when fully configured", () => {
    const adapter = createDeliveryAdapter({
      nodeEnv: "production",
      resendApiKey: "re_test",
      fromEmail: "no-reply@example.com",
    });
    expect(adapter.name).toBe("resend");
  });

  it("returns the console driver in development when unconfigured", () => {
    expect(createDeliveryAdapter({ nodeEnv: "development" }).name).toBe("console");
  });

  // The important case. Falling back silently would send every customer's code to a
  // server log while sign-in still appeared to work — an outage and a disclosure at once.
  it("refuses to fall back to the console driver in production", () => {
    expect(() => createDeliveryAdapter({ nodeEnv: "production" })).toThrowError(
      /refusing to fall back/,
    );
  });

  it("refuses in production when only one of the two settings is present", () => {
    expect(() =>
      createDeliveryAdapter({ nodeEnv: "production", resendApiKey: "re_test" }),
    ).toThrowError(/not configured/);
    expect(() =>
      createDeliveryAdapter({ nodeEnv: "production", fromEmail: "a@b.com" }),
    ).toThrowError(/not configured/);
  });
});

describe("ConsoleDeliveryAdapter", () => {
  it("resolves without throwing", async () => {
    await expect(new ConsoleDeliveryAdapter().send(message)).resolves.toBeUndefined();
  });
});
