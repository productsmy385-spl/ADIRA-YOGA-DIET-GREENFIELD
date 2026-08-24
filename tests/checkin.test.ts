import {beforeEach, expect, it} from "vitest";

import {
  findCheckIn,
  listCheckInsInRange,
  upsertCheckIn,
} from "@/server/repositories/checkins";
import { createOrganization } from "@/server/repositories/organizations";
import { createUser } from "@/server/repositories/users";

import {describeIsolated, resetDatabase} from "./helpers/sql-db";


interface Fixture {
  orgId: string;
  otherOrgId: string;
  customerId: string;
  otherCustomerId: string;
}

async function seed(): Promise<Fixture> {
  const org = await createOrganization({ name: "Studio", slug: "studio" });
  const other = await createOrganization({ name: "Other", slug: "other" });

  const customer = await createUser({
    organizationId: org.id,
    email: "anita@studio.test",
    fullName: "Anita",
    role: "CUSTOMER",
    status: "ACTIVE",
  });

  const otherCustomer = await createUser({
    organizationId: other.id,
    email: "bob@other.test",
    fullName: "Bob",
    role: "CUSTOMER",
    status: "ACTIVE",
  });

  return {
    orgId: org.id,
    otherOrgId: other.id,
    customerId: customer.id,
    otherCustomerId: otherCustomer.id,
  };
}

describeIsolated("daily check-in", () => {
  let f: Fixture;
  const day = "2026-09-01";

  beforeEach(async () => {
    await resetDatabase();
    f = await seed();
  });

  it("records a check-in and reads it back on the same date", async () => {
    await upsertCheckIn(f.orgId, f.customerId, day, {
      mood: 4,
      sleepQuality: 3,
      waterGlasses: 6,
      notes: "Knee felt better.",
    });

    const found = await findCheckIn(f.orgId, f.customerId, day);
    expect(found).toMatchObject({
      checkinDate: day,
      mood: 4,
      sleepQuality: 3,
      waterGlasses: 6,
      notes: "Knee felt better.",
    });
  });

  /**
   * §17 allows one check-in per day, so a second submission is an AMENDMENT. Someone who
   * checks in at breakfast and adds their sleep at lunchtime must not be told they
   * already checked in.
   */
  it("amends rather than duplicating a second submission on the same day", async () => {
    await upsertCheckIn(f.orgId, f.customerId, day, { mood: 2 });
    await upsertCheckIn(f.orgId, f.customerId, day, { waterGlasses: 8 });

    const all = await listCheckInsInRange(f.orgId, f.customerId, day, day);
    expect(all).toHaveLength(1);
    expect(all[0].waterGlasses).toBe(8);
  });

  /**
   * The COALESCE rule. Adding water at lunchtime must not erase this morning's mood —
   * the common case of a partial update is additive, not destructive.
   */
  it("preserves fields omitted from a later submission", async () => {
    await upsertCheckIn(f.orgId, f.customerId, day, {
      mood: 5,
      notes: "Slept well.",
    });
    await upsertCheckIn(f.orgId, f.customerId, day, { waterGlasses: 7 });

    const found = await findCheckIn(f.orgId, f.customerId, day);
    expect(found?.mood).toBe(5);
    expect(found?.notes).toBe("Slept well.");
    expect(found?.waterGlasses).toBe(7);
  });

  it("keeps each day separate", async () => {
    await upsertCheckIn(f.orgId, f.customerId, "2026-09-01", { mood: 2 });
    await upsertCheckIn(f.orgId, f.customerId, "2026-09-02", { mood: 5 });

    const range = await listCheckInsInRange(
      f.orgId,
      f.customerId,
      "2026-09-01",
      "2026-09-02",
    );
    expect(range.map((c) => [c.checkinDate, c.mood])).toEqual([
      ["2026-09-01", 2],
      ["2026-09-02", 5],
    ]);
  });

  // The date must survive the round trip unshifted — a DATE read into a JS Date lands at
  // local midnight, and any toISOString() on it moves the day.
  it("returns the date it was given, with no timezone shift", async () => {
    const saved = await upsertCheckIn(f.orgId, f.customerId, "2026-01-01", { mood: 3 });
    expect(saved.checkinDate).toBe("2026-01-01");
    expect((await findCheckIn(f.orgId, f.customerId, "2026-01-01"))?.checkinDate).toBe(
      "2026-01-01",
    );
  });

  it("never returns another customer's check-in", async () => {
    await upsertCheckIn(f.orgId, f.customerId, day, { mood: 4, notes: "private" });

    expect(await findCheckIn(f.orgId, f.otherCustomerId, day)).toBeNull();
    expect(await findCheckIn(f.otherOrgId, f.customerId, day)).toBeNull();
    expect(await listCheckInsInRange(f.otherOrgId, f.customerId, day, day)).toEqual([]);
  });

  it("rejects a mood outside the 1-5 band", async () => {
    await expect(
      upsertCheckIn(f.orgId, f.customerId, day, { mood: 9 }),
    ).rejects.toThrow();
  });

  it("rejects a negative glass count", async () => {
    await expect(
      upsertCheckIn(f.orgId, f.customerId, day, { waterGlasses: -1 }),
    ).rejects.toThrow();
  });

  // Checking in to say "I did not practise" is engagement, not failure — an empty
  // check-in must still be recordable.
  it("accepts a check-in with nothing filled in", async () => {
    const saved = await upsertCheckIn(f.orgId, f.customerId, day, {});
    expect(saved.checkinDate).toBe(day);
    expect(saved.mood).toBeNull();
  });
});
