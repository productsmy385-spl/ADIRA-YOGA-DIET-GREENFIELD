import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Every mutation in the programme builder, and the properties that would fail quietly.
 *
 * The theme throughout: the organization comes from the session, the position and selection
 * are validated before the database sees them, and a constraint violation becomes a message
 * rather than a 500.
 */

const requireRole = vi.fn();
const createProgramme = vi.fn();
const updateProgramme = vi.fn();
const duplicateProgramme = vi.fn();
const setProgrammeArchived = vi.fn();
const addProgrammeItem = vi.fn();
const removeProgrammeItem = vi.fn();
const recordAudit = vi.fn();
const redirect = vi.fn(() => {
  // `redirect` throws in Next so the caller stops. Reproduced here, or every action under
  // test would carry on past its own navigation and assertions would drift.
  throw new Error("NEXT_REDIRECT");
});

vi.mock("@/server/auth/guards", () => ({ requireRole }));
vi.mock("@/server/repositories/programmes", () => ({
  createProgramme,
  updateProgramme,
  duplicateProgramme,
  setProgrammeArchived,
  addProgrammeItem,
  removeProgrammeItem,
}));
vi.mock("@/server/repositories/audit-logs", () => ({ recordAudit }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect }));

const {
  createProgrammeAction,
  updateProgrammeAction,
  duplicateProgrammeAction,
  archiveProgrammeAction,
  addProgrammeItemAction,
  removeProgrammeItemAction,
} = await import("./actions");

const SESSION = {
  sessionId: "s",
  userId: "admin-1",
  organizationId: "org-1",
  role: "ADMIN" as const,
  email: "admin@studio.test",
  fullName: "An Admin",
  organizationName: "Studio",
  locale: "en",
  issuedAt: new Date(),
  expiresAt: new Date(Date.now() + 3_600_000),
};

const PROGRAMME_ID = "11111111-1111-4111-8111-111111111111";
const EXERCISE_ID = "22222222-2222-4222-8222-222222222222";
const MEAL_ID = "33333333-3333-4333-8333-333333333333";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

beforeEach(() => {
  requireRole.mockReset().mockResolvedValue(SESSION);
  createProgramme.mockReset().mockResolvedValue({ id: PROGRAMME_ID, version: 1 });
  updateProgramme.mockReset().mockResolvedValue({ id: PROGRAMME_ID, version: 2 });
  duplicateProgramme.mockReset().mockResolvedValue({ id: "copy-1", itemCount: 8 });
  setProgrammeArchived.mockReset().mockResolvedValue(true);
  addProgrammeItem.mockReset().mockResolvedValue({ id: "item-1" });
  removeProgrammeItem.mockReset().mockResolvedValue(true);
  recordAudit.mockReset();
  redirect.mockClear();
});

describe("create", () => {
  const VALID = { kind: "YOGA", name: "Foundation", durationWeeks: "6", difficulty: "BEGINNER" };

  it("creates from the session's organization and redirects into the builder", async () => {
    await expect(createProgrammeAction({ status: "IDLE" }, form(VALID))).rejects.toThrow(
      "NEXT_REDIRECT",
    );

    expect(createProgramme).toHaveBeenCalledWith("org-1", {
      kind: "YOGA",
      name: "Foundation",
      description: null,
      durationWeeks: 6,
      difficulty: "BEGINNER",
    });
    // Straight to the builder: an empty programme is not usable.
    expect(redirect).toHaveBeenCalledWith(`/admin/programmes/${PROGRAMME_ID}`);
  });

  it("ignores an organizationId in the form", async () => {
    await expect(
      createProgrammeAction({ status: "IDLE" }, form({ ...VALID, organizationId: "org-2" })),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(createProgramme.mock.calls[0][0]).toBe("org-1");
  });

  it("rejects a duplicate name as a field error", async () => {
    createProgramme.mockRejectedValue(
      Object.assign(new Error("dup"), {
        code: "23505",
        constraint: "programme_name_unique_per_org",
      }),
    );

    const result = await createProgrammeAction({ status: "IDLE" }, form(VALID));

    expect(result.status).toBe("ERROR");
    expect(result.fieldErrors?.name).toBeTruthy();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("refuses a non-admin", async () => {
    requireRole.mockResolvedValue({ ...SESSION, role: "USER" });

    const result = await createProgrammeAction({ status: "IDLE" }, form(VALID));

    expect(result.status).toBe("ERROR");
    expect(createProgramme).not.toHaveBeenCalled();
  });

  it("rejects a length outside 1-52 weeks", async () => {
    for (const weeks of ["0", "53", "-4"]) {
      createProgramme.mockClear();
      const result = await createProgrammeAction(
        { status: "IDLE" },
        form({ ...VALID, durationWeeks: weeks }),
      );
      expect(result.status).toBe("ERROR");
      expect(createProgramme).not.toHaveBeenCalled();
    }
  });
});

describe("update", () => {
  const VALID = {
    programmeId: PROGRAMME_ID,
    name: "Foundation II",
    durationWeeks: "8",
    difficulty: "INTERMEDIATE",
  };

  it("updates and reports the new version", async () => {
    const result = await updateProgrammeAction({ status: "IDLE" }, form(VALID));

    expect(result.status).toBe("DONE");
    expect(updateProgramme).toHaveBeenCalledWith("org-1", PROGRAMME_ID, {
      name: "Foundation II",
      description: null,
      durationWeeks: 8,
      difficulty: "INTERMEDIATE",
    });
    // The version bump is what makes assignment provenance answerable (ADR-009).
    expect(recordAudit.mock.calls[0][0].metadata).toMatchObject({ version: 2 });
  });

  it("reports a programme from another tenant as gone, not forbidden", async () => {
    // The repository scopes by organization_id, so a foreign id simply returns null.
    // Saying "no longer exists" avoids confirming it exists somewhere else.
    updateProgramme.mockResolvedValue(null);

    const result = await updateProgrammeAction({ status: "IDLE" }, form(VALID));

    expect(result.status).toBe("ERROR");
    expect(result.message).toMatch(/no longer exists/i);
  });
});

describe("duplicate", () => {
  it("copies within the session's organization and opens the copy", async () => {
    await expect(
      duplicateProgrammeAction(form({ programmeId: PROGRAMME_ID })),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(duplicateProgramme).toHaveBeenCalledWith("org-1", PROGRAMME_ID);
    expect(redirect).toHaveBeenCalledWith("/admin/programmes/copy-1");
  });

  it("records how many items came across", async () => {
    // A copy that got the row but not the items looks like a programme and prescribes
    // nothing, so the count is worth having in the trail.
    await expect(
      duplicateProgrammeAction(form({ programmeId: PROGRAMME_ID })),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(recordAudit.mock.calls[0][0].metadata).toMatchObject({
      copiedFrom: PROGRAMME_ID,
      items: 8,
    });
  });

  it("does nothing for a non-admin", async () => {
    requireRole.mockResolvedValue({ ...SESSION, role: "USER" });
    await duplicateProgrammeAction(form({ programmeId: PROGRAMME_ID }));
    expect(duplicateProgramme).not.toHaveBeenCalled();
  });
});

describe("archive and restore", () => {
  it("archives", async () => {
    await archiveProgrammeAction(form({ programmeId: PROGRAMME_ID, archived: "true" }));
    expect(setProgrammeArchived).toHaveBeenCalledWith("org-1", PROGRAMME_ID, true);
  });

  it("restores", async () => {
    await archiveProgrammeAction(form({ programmeId: PROGRAMME_ID, archived: "false" }));
    expect(setProgrammeArchived).toHaveBeenCalledWith("org-1", PROGRAMME_ID, false);
  });

  it("does nothing for a non-admin", async () => {
    requireRole.mockResolvedValue({ ...SESSION, role: "USER" });
    await archiveProgrammeAction(form({ programmeId: PROGRAMME_ID, archived: "true" }));
    expect(setProgrammeArchived).not.toHaveBeenCalled();
  });
});

describe("adding an item", () => {
  const YOGA_ITEM = {
    programmeId: PROGRAMME_ID,
    weekNumber: "2",
    dayOfWeek: "3",
    yogaExerciseId: EXERCISE_ID,
    durationMinutes: "5",
  };

  it("converts minutes to seconds", async () => {
    await addProgrammeItemAction({ status: "IDLE" }, form(YOGA_ITEM));

    expect(addProgrammeItem).toHaveBeenCalledWith("org-1", PROGRAMME_ID, {
      weekNumber: 2,
      dayOfWeek: 3,
      yogaExerciseId: EXERCISE_ID,
      mealId: null,
      slot: null,
      durationSeconds: 300,
      repetitions: null,
      notes: null,
    });
  });

  it("requires exactly one of exercise or meal", async () => {
    // Both would be a row that is an exercise AND a meal; neither would occupy a position
    // in somebody's day while prescribing nothing.
    const both = await addProgrammeItemAction(
      { status: "IDLE" },
      form({ ...YOGA_ITEM, mealId: MEAL_ID }),
    );
    expect(both.status).toBe("ERROR");

    const neither = await addProgrammeItemAction(
      { status: "IDLE" },
      form({ programmeId: PROGRAMME_ID, weekNumber: "1", dayOfWeek: "1" }),
    );
    expect(neither.status).toBe("ERROR");

    expect(addProgrammeItem).not.toHaveBeenCalled();
  });

  it("rejects a day outside 1-7", async () => {
    for (const day of ["0", "8"]) {
      const result = await addProgrammeItemAction(
        { status: "IDLE" },
        form({ ...YOGA_ITEM, dayOfWeek: day }),
      );
      expect(result.status).toBe("ERROR");
    }
    expect(addProgrammeItem).not.toHaveBeenCalled();
  });

  it("treats blank selects as absent rather than failing uuid parsing", async () => {
    // Every unselected <select> posts "". Without stripping them the form would reject a
    // perfectly valid meal row because `yogaExerciseId` was "".
    await addProgrammeItemAction(
      { status: "IDLE" },
      form({
        programmeId: PROGRAMME_ID,
        weekNumber: "1",
        dayOfWeek: "1",
        mealId: MEAL_ID,
        yogaExerciseId: "",
        slot: "",
        notes: "",
      }),
    );

    expect(addProgrammeItem).toHaveBeenCalledTimes(1);
    expect(addProgrammeItem.mock.calls[0][2]).toMatchObject({
      mealId: MEAL_ID,
      yogaExerciseId: null,
      slot: null,
      notes: null,
    });
  });

  it("turns a position collision into a message, not a 500", async () => {
    addProgrammeItem.mockRejectedValue(
      Object.assign(new Error("dup"), {
        code: "23505",
        constraint: "programme_item_position_unique",
      }),
    );

    const result = await addProgrammeItemAction({ status: "IDLE" }, form(YOGA_ITEM));

    expect(result.status).toBe("ERROR");
    expect(result.message).toMatch(/already occupies/i);
  });

  it("reports a foreign programme as gone", async () => {
    addProgrammeItem.mockRejectedValue(new Error("Programme not found."));

    const result = await addProgrammeItemAction({ status: "IDLE" }, form(YOGA_ITEM));

    expect(result.status).toBe("ERROR");
    expect(result.message).toMatch(/no longer exists/i);
  });

  it("does not pass a sequence, leaving the repository to compute it", async () => {
    // Computing it in the application races: two admins adding to the same day both read
    // the same maximum and collide.
    await addProgrammeItemAction({ status: "IDLE" }, form(YOGA_ITEM));
    expect(addProgrammeItem.mock.calls[0][2]).not.toHaveProperty("sequence");
  });
});

describe("removing an item", () => {
  it("removes within the session's organization", async () => {
    await removeProgrammeItemAction(
      form({ programmeId: PROGRAMME_ID, itemId: "item-1" }),
    );
    expect(removeProgrammeItem).toHaveBeenCalledWith("org-1", PROGRAMME_ID, "item-1");
  });

  it("does nothing for a non-admin", async () => {
    requireRole.mockResolvedValue({ ...SESSION, role: "USER" });
    await removeProgrammeItemAction(form({ programmeId: PROGRAMME_ID, itemId: "item-1" }));
    expect(removeProgrammeItem).not.toHaveBeenCalled();
  });
});
