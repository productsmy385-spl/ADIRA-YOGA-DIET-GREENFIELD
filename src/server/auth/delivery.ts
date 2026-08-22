import { branding } from "@/lib/branding";

/**
 * OTP delivery, behind an adapter (decisions/ADR-007).
 *
 * The OTP domain must never learn which channel is in use. The moment a service branches
 * on `if (channel === "email")`, adding SMS stops being an adapter and becomes a
 * refactor — and ADR-007's central promise is broken. Any such branch outside this file
 * is the signal that the decision has eroded.
 *
 * Resend is the only real driver. A console driver exists for development, and it is
 * deliberately impossible to select in production.
 */

export interface OtpMessage {
  readonly to: string;
  readonly code: string;
  /** How long the recipient has, in minutes — stated in the message so it is not a surprise. */
  readonly expiresInMinutes: number;
  readonly purpose: "ACCOUNT_ACTIVATION" | "ACCOUNT_RECOVERY" | "NEW_DEVICE" | "STEP_UP";
}

export interface OtpDeliveryAdapter {
  readonly name: string;
  send(message: OtpMessage): Promise<void>;
}

/**
 * What the message says, by purpose.
 *
 * Each states what the code is *for*. A code that arrives saying only "your code is
 * 123456" gives the recipient no way to notice that they did not ask for it — and an
 * unexpected recovery code is exactly the signal that someone is attacking the account.
 */
const SUBJECTS: Record<OtpMessage["purpose"], string> = {
  ACCOUNT_ACTIVATION: `Activate your ${branding.name} account`,
  ACCOUNT_RECOVERY: `Recover your ${branding.name} account`,
  NEW_DEVICE: `Verify a new device on ${branding.name}`,
  STEP_UP: `Confirm a sensitive action on ${branding.name}`,
};

const INTENTS: Record<OtpMessage["purpose"], string> = {
  ACCOUNT_ACTIVATION: "activate your account",
  ACCOUNT_RECOVERY: "recover access to your account",
  NEW_DEVICE: "sign in on a new device",
  STEP_UP: "confirm a sensitive action",
};

export function renderOtpEmail(message: OtpMessage): { subject: string; text: string } {
  return {
    subject: SUBJECTS[message.purpose],
    text: [
      `Your ${branding.name} verification code is:`,
      ``,
      `    ${message.code}`,
      ``,
      `It expires in ${message.expiresInMinutes} minutes and can be used once.`,
      ``,
      `You are receiving this because someone asked to ${INTENTS[message.purpose]}.`,
      `If that was not you, do not share this code with anyone — nobody from`,
      `${branding.name} will ever ask you for it. You can ignore this message;`,
      `no change has been made to your account.`,
    ].join("\n"),
  };
}

/**
 * Resend driver.
 *
 * The client is constructed lazily so that importing this module does not require
 * credentials — which matters because the OTP service imports it at module load, and
 * Phase 0's environment schema treats `RESEND_API_KEY` as optional until this phase.
 */
export class ResendDeliveryAdapter implements OtpDeliveryAdapter {
  readonly name = "resend";

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(message: OtpMessage): Promise<void> {
    const { Resend } = await import("resend");
    const client = new Resend(this.apiKey);
    const { subject, text } = renderOtpEmail(message);

    const result = await client.emails.send({
      from: this.from,
      to: message.to,
      subject,
      text,
    });

    if (result.error) {
      // The code must not reach the log. The address may, because operating an email
      // integration without knowing which address failed is not workable.
      throw new Error(
        `OTP delivery to ${message.to} failed: ${result.error.name} — ${result.error.message}`,
      );
    }
  }
}

/**
 * Development driver. Prints the code to the server console.
 *
 * `createDeliveryAdapter` refuses to return this in production, so the failure mode of
 * a missing API key is a hard error at startup rather than codes silently going to a
 * log file that nobody is reading.
 */
export class ConsoleDeliveryAdapter implements OtpDeliveryAdapter {
  readonly name = "console";

  async send(message: OtpMessage): Promise<void> {
    const { subject } = renderOtpEmail(message);
    console.info(
      `\n[otp:console] ${subject}\n[otp:console] to   ${message.to}\n` +
        `[otp:console] code ${message.code}  (expires in ${message.expiresInMinutes}m)\n`,
    );
  }
}

export interface DeliveryConfig {
  readonly nodeEnv: string;
  readonly resendApiKey?: string;
  readonly fromEmail?: string;
}

/**
 * Choose a driver.
 *
 * In production, a missing key throws. The alternative — quietly falling back to the
 * console driver — would mean every customer's code going to a server log while
 * sign-in appears to work, which is both an outage and a disclosure.
 */
export function createDeliveryAdapter(config: DeliveryConfig): OtpDeliveryAdapter {
  const { nodeEnv, resendApiKey, fromEmail } = config;

  if (resendApiKey && fromEmail) {
    return new ResendDeliveryAdapter(resendApiKey, fromEmail);
  }

  if (nodeEnv === "production") {
    throw new Error(
      "OTP delivery is not configured. RESEND_API_KEY and OTP_FROM_EMAIL are both " +
        "required in production — refusing to fall back to the console driver, which " +
        "would write every verification code to the server log.",
    );
  }

  return new ConsoleDeliveryAdapter();
}
