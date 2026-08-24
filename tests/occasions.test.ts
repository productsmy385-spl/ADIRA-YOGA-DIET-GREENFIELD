import { beforeEach, expect, it } from "vitest";

import { query } from "@/server/db/pool";
import { createOrganization } from "@/server/repositories/organizations";
import { createUser } from "@/server/repositories/users";
import {
  birthdaysAndAnniversariesOn,
  festivalGreetingsOn,
  runDailyGreetings,
} from "@/server/services/occasions";

import { describeIsolated, resetDatabase } from "./helpers/sql-db";

/**
 * Scheduled greetings (migration 010).
 *
 * The interesting assertions are not "a birthday produces a message" — they are the three
 * ways this feature goes wrong in production:
 *
 *   sending twice        a retried cron greeting somebody three times
 *   greeting the wrong   a suspended member wished happy birthday the week their access
 *   person               was withdrawn
 *   crossing tenants     one organisation's nightly job writing another's rows
 */

describeIsolated("scheduled greetings", () => {
  let orgId: string;
  let otherOrgId: string;

  beforeEach(async () => {
    await resetDatabase();
    orgId = (await createOrganization({ name: "Greeting Studio", slug: "greet" })).id;
    otherOrgId = (await createOrganization({ name: "Other", slug: "greet-other" })).id;
  });

  const member = async (
    organizationId: string,
    email: string,
    dates: { dob?: string; anniversary?: string } = {},
    status: "ACTIVE" | "SUSPENDED" = "ACTIVE",
  ) => {
    const user = await createUser({
      organizationId,
      email,
      fullName: email.split("@")[0],
      role: "CUSTOMER",
      status,
    });
    if (dates.dob || dates.anniversary) {
      await query(
        `UPDATE users SET date_of_birth = $2::date, wedding_anniversary = $3::date
          WHERE id = $1`,
        [user.id, dates.dob ?? null, dates.anniversary ?? null],
      );
    }
    return user.id;
  };

  it("finds a birthday regardless of the year it was born in", async () => {
    const id = await member(orgId, "anita@greet.test", { dob: "1988-03-14" });

    const due = await birthdaysAndAnniversariesOn("2026-03-14");
    expect(due.map((d) => d.userId)).toContain(id);

    // A different day finds nobody — the match is on month and day, not "any birthday".
    expect((await birthdaysAndAnniversariesOn("2026-03-15")).map((d) => d.userId)).not.toContain(
      id,
    );
  });

  it("finds an anniversary on the same rules", async () => {
    const id = await member(orgId, "bhavna@greet.test", { anniversary: "2015-11-02" });

    const due = await birthdaysAndAnniversariesOn("2026-11-02");
    const entry = due.find((d) => d.userId === id);

    expect(entry?.kind).toBe("ANNIVERSARY");
  });

  /**
   * THE case. The nightly job may run twice — a retry, an overlap, a manual trigger — and
   * three birthday messages is worse than none, because it is visibly broken in a way the
   * member sees.
   */
  it("never greets the same person twice for the same occasion", async () => {
    await member(orgId, "twice@greet.test", { dob: "1990-06-01" });

    const first = await runDailyGreetings("2026-06-01");
    expect(first.created).toBe(1);

    const second = await runDailyGreetings("2026-06-01");
    expect(second.created).toBe(0);
    expect(second.duplicatesSkipped).toBe(1);

    const rows = await query<{ n: string }>(
      `SELECT count(*)::text AS n FROM notifications WHERE kind = 'BIRTHDAY'`,
    );
    expect(Number(rows[0].n)).toBe(1);
  });

  it("does not greet a suspended member", async () => {
    await member(orgId, "suspended@greet.test", { dob: "1985-04-04" }, "SUSPENDED");

    const due = await birthdaysAndAnniversariesOn("2026-04-04");
    expect(due).toEqual([]);

    const result = await runDailyGreetings("2026-04-04");
    expect(result.created).toBe(0);
  });

  it("greets a member on both occasions when they fall on one day", async () => {
    await member(orgId, "both@greet.test", { dob: "1980-09-09", anniversary: "2010-09-09" });

    const result = await runDailyGreetings("2026-09-09");

    // Two distinct occasion keys, so both land — the index prevents repeats of the SAME
    // occasion, not two different ones.
    expect(result.created).toBe(2);
  });

  it("sends a festival greeting to every active member of the organisation that observes it", async () => {
    const a = await member(orgId, "a@greet.test");
    const b = await member(orgId, "b@greet.test");
    const foreign = await member(otherOrgId, "c@other.test");

    await query(
      `INSERT INTO organization_festivals (organization_id, name, observed_on, greeting)
       VALUES ($1, 'Diwali', '2026-11-08'::date, 'Wishing you light and calm.')`,
      [orgId],
    );

    const due = await festivalGreetingsOn("2026-11-08");
    const ids = due.map((d) => d.userId);

    expect(ids).toContain(a);
    expect(ids).toContain(b);
    // The other organisation did not record this festival, so nobody there is greeted.
    expect(ids).not.toContain(foreign);
  });

  it("keeps two festivals on one day separate", async () => {
    await member(orgId, "dual@greet.test");

    await query(
      `INSERT INTO organization_festivals (organization_id, name, observed_on)
       VALUES ($1, 'Festival A', '2026-12-25'::date), ($1, 'Festival B', '2026-12-25'::date)`,
      [orgId],
    );

    const result = await runDailyGreetings("2026-12-25");

    // Keyed by festival id, not by date — otherwise the second would collide with the
    // first and silently vanish.
    expect(result.created).toBe(2);
  });

  it("greets nobody when nothing is due", async () => {
    await member(orgId, "quiet@greet.test", { dob: "1991-01-01" });

    const result = await runDailyGreetings("2026-07-07");
    expect(result).toEqual({ created: 0, duplicatesSkipped: 0, failed: 0 });
  });

  /**
   * A leap-day birthday simply does not match in a non-leap year, and that is deliberate:
   * greeting on the 28th or the 1st would be choosing for them, and neither is obviously
   * right.
   */
  it("leaves a 29 February birthday unmatched in a non-leap year", async () => {
    await member(orgId, "leap@greet.test", { dob: "2000-02-29" });

    expect(await birthdaysAndAnniversariesOn("2027-02-28")).toEqual([]);
    expect((await birthdaysAndAnniversariesOn("2028-02-29")).length).toBe(1);
  });
});
