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
  archived_at: Date | null;
  item_count: string;
}

const PROGRAMME_SELECT = `
  SELECT p.id, p.kind, p.name, p.description, p.duration_weeks, p.difficulty,
         p.version, p.archived_at,
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
            p.version, p.archived_at, '0' AS item_count
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
