import { describe, expect, it } from "vitest";

import { selectEnterableAccounts } from "./sign-in";

/**
 * The invite-only and link-once rules (ADR-015, after FlowDine OS RASOIOS-ADR-006).
 * Pure: no Clerk, no database — the rule is what is under test.
 */

type Row = { id: string; status: string; clerkUserId: string | null };

const row = (id: string, status: string, clerkUserId: string | null = null): Row => ({
  id,
  status,
  clerkUserId,
});

const ME = "user_me";
const SOMEONE_ELSE = "user_other";

describe("selectEnterableAccounts", () => {
  it("lets an INVITED, never-linked account in — that is the invitation being accepted", () => {
    const { enterable, conflicts } = selectEnterableAccounts([row("a", "INVITED")], ME);
    expect(enterable.map((r) => r.id)).toEqual(["a"]);
    expect(conflicts).toEqual([]);
  });

  it("lets an ACTIVE account linked to this Clerk user in", () => {
    expect(selectEnterableAccounts([row("a", "ACTIVE", ME)], ME).enterable).toHaveLength(1);
  });

  it("gives nothing to an address with no accounts — no accounts for the uninvited", () => {
    expect(selectEnterableAccounts([], ME)).toEqual({ enterable: [], conflicts: [] });
  });

  it.each(["SUSPENDED", "DISABLED", "LOCKED", "PENDING"])(
    "does not admit a %s account",
    (status) => {
      expect(selectEnterableAccounts([row("a", status)], ME).enterable).toEqual([]);
    },
  );

  /**
   * LINK-ONCE. A row bound to another Clerk user must never be entered by this one, even
   * though this one proved the same address — that is what stops a re-created or second
   * Clerk account from inheriting somebody's access.
   */
  it("treats an account bound to a different Clerk user as a conflict, not an entry", () => {
    const { enterable, conflicts } = selectEnterableAccounts(
      [row("a", "ACTIVE", SOMEONE_ELSE)],
      ME,
    );
    expect(enterable).toEqual([]);
    expect(conflicts.map((r) => r.id)).toEqual(["a"]);
  });

  it("reports a conflict even on an account that would be blocked anyway", () => {
    const { conflicts } = selectEnterableAccounts([row("a", "SUSPENDED", SOMEONE_ELSE)], ME);
    expect(conflicts).toHaveLength(1);
  });

  it("keeps the enterable accounts when only some conflict (multi-organization)", () => {
    const { enterable, conflicts } = selectEnterableAccounts(
      [row("a", "ACTIVE", ME), row("b", "ACTIVE", SOMEONE_ELSE), row("c", "INVITED")],
      ME,
    );
    expect(enterable.map((r) => r.id)).toEqual(["a", "c"]);
    expect(conflicts.map((r) => r.id)).toEqual(["b"]);
  });
});
