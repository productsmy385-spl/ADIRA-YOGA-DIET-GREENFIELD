import { describe, expect, it } from "vitest";

import {
  expectedOriginFrom,
  relyingPartyIdFrom,
  webauthnConfigFrom,
} from "./webauthn-config";

/**
 * The RP id and expected origin are the two values that decide whether a passkey works
 * at all. Getting them wrong does not weaken security — it breaks sign-in, with an error
 * that names neither this file nor APP_URL.
 */

describe("relyingPartyIdFrom", () => {
  it("is the hostname, without scheme", () => {
    expect(relyingPartyIdFrom("https://adira.example")).toBe("adira.example");
  });

  // The one that matters. WebAuthn scopes credentials by DOMAIN, not by origin, so a
  // passkey registered on :3000 must still resolve on :443. Including the port produces
  // credentials that silently stop working the day the port changes.
  it("strips the port", () => {
    expect(relyingPartyIdFrom("http://localhost:3000")).toBe("localhost");
    expect(relyingPartyIdFrom("https://adira.example:8443")).toBe("adira.example");
  });

  it("strips a path", () => {
    expect(relyingPartyIdFrom("https://adira.example/app/login")).toBe("adira.example");
  });

  it("handles a subdomain, which is a distinct RP id", () => {
    // Not a bug: a credential registered for staging.adira.example genuinely must not
    // work on adira.example.
    expect(relyingPartyIdFrom("https://staging.adira.example")).toBe(
      "staging.adira.example",
    );
  });
});

describe("expectedOriginFrom", () => {
  it("keeps scheme and port, because the browser sends the exact origin", () => {
    expect(expectedOriginFrom("http://localhost:3000")).toBe("http://localhost:3000");
    expect(expectedOriginFrom("https://adira.example")).toBe("https://adira.example");
  });

  it("normalises away a trailing slash", () => {
    // APP_URL is hand-edited in a dashboard; a trailing slash is the likeliest typo and
    // would otherwise fail the literal origin comparison.
    expect(expectedOriginFrom("https://adira.example/")).toBe("https://adira.example");
  });

  it("normalises away a default port", () => {
    expect(expectedOriginFrom("https://adira.example:443")).toBe("https://adira.example");
    expect(expectedOriginFrom("http://adira.example:80")).toBe("http://adira.example");
  });

  it("drops a path", () => {
    expect(expectedOriginFrom("https://adira.example/login")).toBe("https://adira.example");
  });
});

describe("webauthnConfigFrom", () => {
  it("derives both values from one URL", () => {
    expect(webauthnConfigFrom("https://adira.example:8443/app", "Adira")).toEqual({
      rpId: "adira.example",
      rpName: "Adira",
      expectedOrigin: "https://adira.example:8443",
    });
  });

  it("produces a working local development pair", () => {
    // localhost is the one hostname browsers allow WebAuthn on over plain HTTP.
    expect(webauthnConfigFrom("http://localhost:3000", "Adira")).toEqual({
      rpId: "localhost",
      rpName: "Adira",
      expectedOrigin: "http://localhost:3000",
    });
  });

  it("throws on a malformed URL rather than producing a silently broken config", () => {
    expect(() => webauthnConfigFrom("not-a-url", "Adira")).toThrow();
  });
});
