import { query, queryOne, transaction } from "@/server/db/pool";
import type {
  DifficultyLevelValue,
  MealSlotValue,
  ProgrammeKindValue,
} from "@/server/db/types";

/**
 * Programme templates and their items (Phases 6 and 7).
 *
 * A programme is a reusable plan a consultant builds once and assigns many times. It
 * carries positions — week, day, sequence — and never dates: a template has no calendar,
 * and the assignment supplies the start (see `services/schedule.ts`).
 *
 * THE VERSION IS LOAD-BEARING.
 *
 * Every mutation bumps `programmes.version`, and `createAssignmentFromProgramme` copies
 * that number onto the assignment. It is the answer to "which version of Foundation was
 * Anita given", which stays answerable after the template has moved on. ADR-009 means
 * editing a template never reaches an assigned customer — the version is how we can
 * still tell what they were given.
 *
 * Bumping on every item change, not just on renaming the programme, is deliberate:
 * changing week 2's exercises is a bigger change to the plan than changing its title.
 */

export interface Programme {
  id: string;
  kind: ProgrammeKindValue;
  name: string;
  description: string | null;
  durationWeeks: number;
  difficulty: DifficultyLevelValue;
  version: number;
  /** Null = draft. Set = assignable. See `lifecycleOf` (migration 009). */
  publishedAt: Date | null;
  archivedAt: Date | null;
  itemCount: number;
}

interface ProgrammeRow {
  id: string;
  kind: ProgrammeKindValue;
  name: string;
  description: string | null;
  duration_weeks: number;
  difficulty: DifficultyLevelValue;
  version: number;
  published_at: Date | null;
  archived_at: Date | null;
  item_count: string;
}

const PROGRAMME_SELECT = `
  SELECT p.id, p.kind, p.name, p.description, p.duration_weeks, p.difficulty,
         p.version, p.published_at, p.archived_at,
         (SELECT count(*) FROM programme_items i WHERE i.programme_id = p.id)::text AS item_count
    FROM programmes p
`;

function toProgramme(row: ProgrammeRow): Programme {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    description: row.description,
    durationWeeks: row.duration_weeks,
    difficulty: row.difficulty,
    version: row.version,
    publishedAt: row.published_at,
    archivedAt: row.archived_at,
    itemCount: Number(row.item_count),
  };
}

export interface NewProgramme {
  kind: ProgrammeKindValue;
  name: string;
  description?: string | null;
  durationWeeks?: number;
  difficulty?: DifficultyLevelValue;
}

export async function createProgramme(
  organizationId: string,
  input: NewProgramme,
): Promise<Programme> {
  const row = await queryOne<ProgrammeRow>(
    `WITH inserted AS (
       INSERT INTO programmes (organization_id, kind, name, description, duration_weeks, difficulty)
       VALUES ($1, $2, $3, $4, COALESCE($5, 4), COALESCE($6, 'BEGINNER'))
       RETURNING *
     )
     SELECT p.id, p.kind, p.name, p.description, p.duration_weeks, p.difficulty,
            p.version, p.published_at, p.archived_at, '0' AS item_count
       FROM inserted p`,
    [
      organizationId,
      input.kind,
      input.name.trim(),
      input.description ?? null,
      input.durationWeeks ?? null,
      input.difficulty ?? null,
    ],
  );
  return toProgramme(row!);
}

export async function listProgrammes(
  organizationId: string,
  kind?: ProgrammeKindValue,
  includeArchived = false,
): Promise<Programme[]> {
  const rows = await query<ProgrammeRow>(
    `${PROGRAMME_SELECT}
      WHERE p.organization_id = $1
        AND ($2::programme_kind IS NULL OR p.kind = $2::programme_kind)
        AND ($3 OR p.archived_at IS NULL)
      ORDER BY p.archived_at NULLS FIRST, p.kind, p.name`,
    [organizationId, kind ?? null, includeArchived],
  );
  return rows.map(toProgramme);
}

export async function findProgramme(
  organizationId: string,
  programmeId: string,
): Promise<Programme | null> {
  const row = await queryOne<ProgrammeRow>(
    `${PROGRAMME_SELECT} WHERE p.id = $2 AND p.organization_id = $1`,
    [organizationId, programmeId],
  );
  return row ? toProgramme(row) : null;
}

export async function updateProgramme(
  organizationId: string,
  programmeId: string,
  input: Omit<NewProgramme, "kind">,
): Promise<Programme | null> {
  const row = await queryOne<{ id: string }>(
    `UPDATE programmes
        SET name = $3, description = $4,
            duration_weeks = COALESCE($5, duration_weeks),
            difficulty = COALESCE($6, difficulty),
            version = version + 1
      WHERE id = $2 AND organization_id = $1
      RETURNING id`,
    [
      organizationId,
      programmeId,
      input.name.trim(),
      input.description ?? null,
      input.durationWeeks ?? null,
      input.difficulty ?? null,
    ],
  );
  return row ? findProgramme(organizationId, programmeId) : null;
}

/**
 * Copy a programme and every item in it.
 *
 * ONE TRANSACTION, and the reason is not tidiness. A programme is only meaningful together
 * with its items — a copy that got the row but not the eight exercises is worse than no
 * copy, because it looks like a programme and silently prescribes nothing. Either the whole
 * plan is duplicated or none of it is.
 *
 * The copy starts at `version = 1`. It is a new template with its own history, not a
 * continuation of the original's; carrying the version across would make provenance a lie
 * the first time somebody asked which one an assignment came from.
 *
 * `programme_name_unique_per_org` is on (organization_id, kind, name), so the caller must
 * supply a free name. The suffix is chosen here rather than in the UI so two admins
 * duplicating at once cannot both pick "(copy)" and have the second fail — the retry loop
 * runs inside the transaction that will hold the name.
 */
export async function duplicateProgramme(
  organizationId: string,
  programmeId: string,
): Promise<Programme | null> {
  return transaction(async (client) => {
    // FOR UPDATE so the source cannot be edited or archived out from under the copy
    // half-way through, which would produce a duplicate of two different states.
    const source = await client.query<{
      kind: ProgrammeKindValue;
      name: string;
      description: string | null;
      duration_weeks: number;
      difficulty: DifficultyLevelValue;
    }>(
      `SELECT kind, name, description, duration_weeks, difficulty
         FROM programmes WHERE id = $2 AND organization_id = $1 FOR UPDATE`,
      [organizationId, programmeId],
    );

    if (source.rowCount === 0) return null;
    const original = source.rows[0];

    /*
     * Find a free name. "(copy)", then "(copy 2)", and so on.
     *
     * Bounded rather than a `while (true)`: an unbounded search inside a transaction
     * holding a row lock is a way to hang a request. Twenty is far past what anyone does
     * deliberately, and hitting it means something is wrong that a retry will not fix.
     */
    let name = "";
    for (let attempt = 1; attempt <= 20; attempt += 1) {
      const candidate =
        attempt === 1 ? `${original.name} (copy)` : `${original.name} (copy ${attempt})`;
      // 200 is the column's practical limit via the application; truncate the STEM rather
      // than the suffix, so the copy marker survives on a very long name.
      const trimmed =
        candidate.length <= 200 ? candidate : `${candidate.slice(0, 190)}… (copy ${attempt})`;

      const taken = await client.query(
        `SELECT 1 FROM programmes
          WHERE organization_id = $1 AND kind = $2 AND name = $3`,
        [organizationId, original.kind, trimmed],
      );

      if (taken.rowCount === 0) {
        name = trimmed;
        break;
      }
    }

    if (!name) throw new Error("Could not find a free name for the copy.");

    const created = await client.query<{ id: string }>(
      `INSERT INTO programmes
         (organization_id, kind, name, description, duration_weeks, difficulty)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        organizationId,
        original.kind,
        name,
        original.description,
        original.duration_weeks,
        original.difficulty,
      ],
    );

    const newId = created.rows[0].id;

    /*
     * Copy the items in one INSERT ... SELECT.
     *
     * Positions come across verbatim — week, day and sequence are the plan's shape, and
     * renumbering them would silently reorder somebody's practice. `organization_id` is
     * written from the parameter rather than copied from the source row, so a copy cannot
     * inherit a tenant id that disagrees with its parent even if the source were somehow
     * wrong.
     */
    await client.query(
      `INSERT INTO programme_items
         (organization_id, programme_id, week_number, day_of_week, sequence,
          yoga_exercise_id, meal_id, duration_seconds, repetitions, slot, notes)
       SELECT $1, $3, week_number, day_of_week, sequence,
              yoga_exercise_id, meal_id, duration_seconds, repetitions, slot, notes
         FROM programme_items
        WHERE programme_id = $2 AND organization_id = $1`,
      [organizationId, programmeId, newId],
    );

    const row = await client.query<ProgrammeRow>(
      `SELECT p.id, p.kind, p.name, p.description, p.duration_weeks, p.difficulty,
              p.version, p.published_at, p.archived_at,
              (SELECT count(*) FROM programme_items i WHERE i.programme_id = p.id)::text
                AS item_count
         FROM programmes p WHERE p.id = $1`,
      [newId],
    );

    return toProgramme(row.rows[0]);
  });
}

export async function setProgrammeArchived(
  organizationId: string,
  programmeId: string,
  archived: boolean,
): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `UPDATE programmes
        SET archived_at = CASE WHEN $3 THEN COALESCE(archived_at, now()) ELSE NULL END
      WHERE id = $2 AND organization_id = $1
      RETURNING id`,
    [organizationId, programmeId, archived],
  );
  return rows.length > 0;
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

export interface ProgrammeItem {
  id: string;
  weekNumber: number;
  dayOfWeek: number;
  sequence: number;
  yogaExerciseId: string | null;
  mealId: string | null;
  title: string;
  durationSeconds: number | null;
  repetitions: number | null;
  slot: MealSlotValue | null;
  notes: string | null;
}

interface ItemRow {
  id: string;
  week_number: number;
  day_of_week: number;
  sequence: number;
  yoga_exercise_id: string | null;
  meal_id: string | null;
  title: string | null;
  duration_seconds: number | null;
  repetitions: number | null;
  slot: MealSlotValue | null;
  notes: string | null;
}

function toItem(row: ItemRow): ProgrammeItem {
  return {
    id: row.id,
    weekNumber: row.week_number,
    dayOfWeek: row.day_of_week,
    sequence: row.sequence,
    yogaExerciseId: row.yoga_exercise_id,
    mealId: row.meal_id,
    // Resolved by join for display. The template shows live library names — unlike an
    // assignment, which snapshots them (ADR-009). A consultant editing a template SHOULD
    // see the current name of the exercise they picked.
    title: row.title ?? "(removed)",
    durationSeconds: row.duration_seconds,
    repetitions: row.repetitions,
    slot: row.slot,
    notes: row.notes,
  };
}

export async function listProgrammeItems(
  organizationId: string,
  programmeId: string,
): Promise<ProgrammeItem[]> {
  const rows = await query<ItemRow>(
    `SELECT i.id, i.week_number, i.day_of_week, i.sequence,
            i.yoga_exercise_id, i.meal_id,
            COALESCE(ye.name, m.name) AS title,
            i.duration_seconds, i.repetitions, i.slot, i.notes
       FROM programme_items i
       LEFT JOIN yoga_exercises ye ON ye.id = i.yoga_exercise_id
       LEFT JOIN meals m          ON m.id  = i.meal_id
      WHERE i.programme_id = $2 AND i.organization_id = $1
      ORDER BY i.week_number, i.day_of_week, i.sequence`,
    [organizationId, programmeId],
  );
  return rows.map(toItem);
}

export interface NewProgrammeItem {
  weekNumber: number;
  dayOfWeek: number;
  sequence?: number;
  yogaExerciseId?: string | null;
  mealId?: string | null;
  durationSeconds?: number | null;
  repetitions?: number | null;
  slot?: MealSlotValue | null;
  notes?: string | null;
}

/**
 * Add an item to a programme.
 *
 * `sequence` defaults to the next free position on that day, computed inside the same
 * transaction as the insert. Computing it in the application would race: two consultants
 * adding to the same day would both read the same maximum and collide on the
 * `(programme, week, day, sequence)` unique constraint.
 */
export async function addProgrammeItem(
  organizationId: string,
  programmeId: string,
  input: NewProgrammeItem,
): Promise<ProgrammeItem> {
  return transaction(async (client) => {
    const owned = await client.query(
      `SELECT 1 FROM programmes WHERE id = $2 AND organization_id = $1 FOR UPDATE`,
      [organizationId, programmeId],
    );
    if (owned.rowCount === 0) throw new Error("Programme not found.");

    const inserted = await client.query<{ id: string }>(
      `INSERT INTO programme_items
         (organization_id, programme_id, week_number, day_of_week, sequence,
          yoga_exercise_id, meal_id, duration_seconds, repetitions, slot, notes)
       VALUES ($1, $2, $3, $4,
               COALESCE($5, (SELECT COALESCE(MAX(sequence) + 1, 0)
                               FROM programme_items
                              WHERE programme_id = $2
                                AND week_number = $3 AND day_of_week = $4)),
               $6, $7, $8, $9, $10, $11)
       RETURNING id`,
      [
        organizationId,
        programmeId,
        input.weekNumber,
        input.dayOfWeek,
        input.sequence ?? null,
        input.yogaExerciseId ?? null,
        input.mealId ?? null,
        input.durationSeconds ?? null,
        input.repetitions ?? null,
        input.slot ?? null,
        input.notes ?? null,
      ],
    );

    // Changing what a programme contains is a bigger change than renaming it.
    await client.query(
      `UPDATE programmes SET version = version + 1 WHERE id = $1`,
      [programmeId],
    );

    const rows = await client.query<ItemRow>(
      `SELECT i.id, i.week_number, i.day_of_week, i.sequence,
              i.yoga_exercise_id, i.meal_id,
              COALESCE(ye.name, m.name) AS title,
              i.duration_seconds, i.repetitions, i.slot, i.notes
         FROM programme_items i
         LEFT JOIN yoga_exercises ye ON ye.id = i.yoga_exercise_id
         LEFT JOIN meals m          ON m.id  = i.meal_id
        WHERE i.id = $1`,
      [inserted.rows[0].id],
    );

    return toItem(rows.rows[0]);
  });
}

/**
 * Remove an item from a template.
 *
 * Safe to delete outright, unlike a library item: `programme_items` is referenced by
 * nothing. Assignments hold snapshots, not references (ADR-009), so removing this from
 * the template leaves every assigned customer's plan untouched.
 */
export async function removeProgrammeItem(
  organizationId: string,
  programmeId: string,
  itemId: string,
): Promise<boolean> {
  return transaction(async (client) => {
    const deleted = await client.query(
      `DELETE FROM programme_items
        WHERE id = $3 AND programme_id = $2 AND organization_id = $1`,
      [organizationId, programmeId, itemId],
    );

    if (deleted.rowCount === 0) return false;

    await client.query(
      `UPDATE programmes SET version = version + 1 WHERE id = $1`,
      [programmeId],
    );
    return true;
  });
}

// ---------------------------------------------------------------------------
// Lifecycle — DRAFT / PUBLISHED / ARCHIVED (migration 009)
// ---------------------------------------------------------------------------

export type ProgrammeLifecycle = "DRAFT" | "PUBLISHED" | "ARCHIVED";

/**
 * Derive the lifecycle state from the two timestamps.
 *
 * Deliberately computed rather than stored. A status column alongside `archived_at` could
 * disagree with it — a row reading PUBLISHED with `archived_at` set has no defined
 * meaning, and nothing would prevent it. Deriving makes the contradiction unrepresentable
 * (migration 009).
 */
export function lifecycleOf(row: {
  publishedAt: Date | null;
  archivedAt: Date | null;
}): ProgrammeLifecycle {
  if (row.archivedAt !== null) return "ARCHIVED";
  return row.publishedAt === null ? "DRAFT" : "PUBLISHED";
}

export type PublishResult =
  | { ok: true }
  | { ok: false; reason: "NOT_FOUND" | "EMPTY" | "ARCHIVED" };

/**
 * Publish a programme, refusing to publish an empty one.
 *
 * The emptiness check and the update are one transaction. An empty published programme
 * generates an empty schedule, which reaches the member as "your plan has no activities"
 * and reaches the admin as though the assignment silently failed — a confusing pair of
 * symptoms for a cause neither of them can see.
 *
 * A table CHECK cannot count rows in another table, and a trigger would fire on every
 * item insert while the programme is still being built. So the rule lives here, where it
 * runs exactly once, at the moment it matters.
 */
export async function publishProgramme(
  organizationId: string,
  programmeId: string,
): Promise<PublishResult> {
  return transaction(async (client) => {
    const existing = await client.query<{ archived_at: Date | null }>(
      `SELECT archived_at FROM programmes
        WHERE organization_id = $1 AND id = $2
        FOR UPDATE`,
      [organizationId, programmeId],
    );

    if (existing.rowCount === 0) return { ok: false as const, reason: "NOT_FOUND" as const };
    if (existing.rows[0].archived_at !== null) {
      return { ok: false as const, reason: "ARCHIVED" as const };
    }

    const items = await client.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM programme_items
        WHERE organization_id = $1 AND programme_id = $2`,
      [organizationId, programmeId],
    );

    if (Number(items.rows[0].n) === 0) return { ok: false as const, reason: "EMPTY" as const };

    await client.query(
      `UPDATE programmes SET published_at = COALESCE(published_at, now())
        WHERE organization_id = $1 AND id = $2`,
      [organizationId, programmeId],
    );

    return { ok: true as const };
  });
}

/**
 * Unpublish. Existing assignments are untouched, by design.
 *
 * An assignment holds its own snapshot (ADR-009), so withdrawing the template from
 * selection cannot disturb a plan somebody is already following. Unpublishing means "stop
 * offering this", never "revoke it from whoever has it".
 */
export async function unpublishProgramme(
  organizationId: string,
  programmeId: string,
): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `UPDATE programmes SET published_at = NULL
      WHERE organization_id = $1 AND id = $2 AND archived_at IS NULL
      RETURNING id`,
    [organizationId, programmeId],
  );
  return rows.length > 0;
}
