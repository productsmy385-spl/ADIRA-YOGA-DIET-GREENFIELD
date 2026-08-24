import { query, queryOne } from "@/server/db/pool";
import type { DifficultyLevelValue, MealSlotValue } from "@/server/db/types";

/**
 * The yoga exercise and meal libraries (Phases 6 and 7).
 *
 * Both are organisation-scoped catalogues a consultant builds programmes from. They live
 * in one module because they are the same shape of thing — a reusable, named, archivable
 * item with instructions — and separating them would duplicate the archive and scoping
 * rules twice over.
 *
 * NOTHING HERE IS EVER DELETED.
 *
 * `setArchived` sets a timestamp; there is no delete function, deliberately. A library
 * item is referenced by `programme_items` (ON DELETE RESTRICT) and its text is copied
 * into the snapshot of every customer plan built from it. Deleting would either fail
 * loudly or strand the provenance on assignments that still describe a practice someone
 * actually performed. Archiving takes it out of the picker and leaves history intact.
 */

export interface YogaExercise {
  id: string;
  name: string;
  description: string | null;
  instructions: string | null;
  breathing: string | null;
  defaultDurationSeconds: number | null;
  defaultRepetitions: number | null;
  difficulty: DifficultyLevelValue;
  archivedAt: Date | null;
}

interface ExerciseRow {
  id: string;
  name: string;
  description: string | null;
  instructions: string | null;
  breathing: string | null;
  default_duration_seconds: number | null;
  default_repetitions: number | null;
  difficulty: DifficultyLevelValue;
  archived_at: Date | null;
}

const EXERCISE_COLUMNS = `
  id, name, description, instructions, breathing,
  default_duration_seconds, default_repetitions, difficulty, archived_at
`;

function toExercise(row: ExerciseRow): YogaExercise {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    instructions: row.instructions,
    breathing: row.breathing,
    defaultDurationSeconds: row.default_duration_seconds,
    defaultRepetitions: row.default_repetitions,
    difficulty: row.difficulty,
    archivedAt: row.archived_at,
  };
}

export interface NewYogaExercise {
  name: string;
  description?: string | null;
  instructions?: string | null;
  breathing?: string | null;
  defaultDurationSeconds?: number | null;
  defaultRepetitions?: number | null;
  difficulty?: DifficultyLevelValue;
}

export async function createYogaExercise(
  organizationId: string,
  input: NewYogaExercise,
): Promise<YogaExercise> {
  const row = await queryOne<ExerciseRow>(
    `INSERT INTO yoga_exercises
       (organization_id, name, description, instructions, breathing,
        default_duration_seconds, default_repetitions, difficulty)
     VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, 'BEGINNER'))
     RETURNING ${EXERCISE_COLUMNS}`,
    [
      organizationId,
      input.name.trim(),
      input.description ?? null,
      input.instructions ?? null,
      input.breathing ?? null,
      input.defaultDurationSeconds ?? null,
      input.defaultRepetitions ?? null,
      input.difficulty ?? null,
    ],
  );
  return toExercise(row!);
}

export async function updateYogaExercise(
  organizationId: string,
  exerciseId: string,
  input: NewYogaExercise,
): Promise<YogaExercise | null> {
  const row = await queryOne<ExerciseRow>(
    `UPDATE yoga_exercises
        SET name = $3, description = $4, instructions = $5, breathing = $6,
            default_duration_seconds = $7, default_repetitions = $8,
            difficulty = COALESCE($9, difficulty)
      WHERE id = $2 AND organization_id = $1
      RETURNING ${EXERCISE_COLUMNS}`,
    [
      organizationId,
      exerciseId,
      input.name.trim(),
      input.description ?? null,
      input.instructions ?? null,
      input.breathing ?? null,
      input.defaultDurationSeconds ?? null,
      input.defaultRepetitions ?? null,
      input.difficulty ?? null,
    ],
  );
  return row ? toExercise(row) : null;
}

export async function listYogaExercises(
  organizationId: string,
  includeArchived = false,
): Promise<YogaExercise[]> {
  const rows = await query<ExerciseRow>(
    `SELECT ${EXERCISE_COLUMNS} FROM yoga_exercises
      WHERE organization_id = $1 AND ($2 OR archived_at IS NULL)
      ORDER BY archived_at NULLS FIRST, name`,
    [organizationId, includeArchived],
  );
  return rows.map(toExercise);
}

export async function findYogaExercise(
  organizationId: string,
  exerciseId: string,
): Promise<YogaExercise | null> {
  const row = await queryOne<ExerciseRow>(
    `SELECT ${EXERCISE_COLUMNS} FROM yoga_exercises WHERE id = $2 AND organization_id = $1`,
    [organizationId, exerciseId],
  );
  return row ? toExercise(row) : null;
}

/** Archive or restore. Idempotent — archiving twice keeps the original timestamp. */
export async function setYogaExerciseArchived(
  organizationId: string,
  exerciseId: string,
  archived: boolean,
): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `UPDATE yoga_exercises
        SET archived_at = CASE WHEN $3 THEN COALESCE(archived_at, now()) ELSE NULL END
      WHERE id = $2 AND organization_id = $1
      RETURNING id`,
    [organizationId, exerciseId, archived],
  );
  return rows.length > 0;
}

// ---------------------------------------------------------------------------
// Meals
// ---------------------------------------------------------------------------

export interface Meal {
  id: string;
  name: string;
  description: string | null;
  instructions: string | null;
  quantity: string | null;
  slot: MealSlotValue | null;
  tags: string[];
  archivedAt: Date | null;
}

interface MealRow {
  id: string;
  name: string;
  description: string | null;
  instructions: string | null;
  quantity: string | null;
  slot: MealSlotValue | null;
  tags: string[];
  archived_at: Date | null;
}

const MEAL_COLUMNS = `id, name, description, instructions, quantity, slot, tags, archived_at`;

function toMeal(row: MealRow): Meal {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    instructions: row.instructions,
    quantity: row.quantity,
    slot: row.slot,
    tags: row.tags,
    archivedAt: row.archived_at,
  };
}

export interface NewMeal {
  name: string;
  description?: string | null;
  instructions?: string | null;
  /** Free text — consultants prescribe "one bowl" or "two rotis", not grams. */
  quantity?: string | null;
  slot?: MealSlotValue | null;
  tags?: string[];
}

export async function createMeal(organizationId: string, input: NewMeal): Promise<Meal> {
  const row = await queryOne<MealRow>(
    `INSERT INTO meals (organization_id, name, description, instructions, quantity, slot, tags)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING ${MEAL_COLUMNS}`,
    [
      organizationId,
      input.name.trim(),
      input.description ?? null,
      input.instructions ?? null,
      input.quantity ?? null,
      input.slot ?? null,
      input.tags ?? [],
    ],
  );
  return toMeal(row!);
}

export async function updateMeal(
  organizationId: string,
  mealId: string,
  input: NewMeal,
): Promise<Meal | null> {
  const row = await queryOne<MealRow>(
    `UPDATE meals
        SET name = $3, description = $4, instructions = $5,
            quantity = $6, slot = $7, tags = COALESCE($8, tags)
      WHERE id = $2 AND organization_id = $1
      RETURNING ${MEAL_COLUMNS}`,
    [
      organizationId,
      mealId,
      input.name.trim(),
      input.description ?? null,
      input.instructions ?? null,
      input.quantity ?? null,
      input.slot ?? null,
      input.tags ?? null,
    ],
  );
  return row ? toMeal(row) : null;
}

export async function listMeals(
  organizationId: string,
  includeArchived = false,
): Promise<Meal[]> {
  const rows = await query<MealRow>(
    `SELECT ${MEAL_COLUMNS} FROM meals
      WHERE organization_id = $1 AND ($2 OR archived_at IS NULL)
      ORDER BY archived_at NULLS FIRST, slot NULLS LAST, name`,
    [organizationId, includeArchived],
  );
  return rows.map(toMeal);
}

/**
 * One meal, scoped to the organisation.
 *
 * `organization_id` is in the WHERE clause rather than checked afterwards, so an id
 * belonging to another tenant returns null instead of a row the caller then has to
 * remember to reject (ADR-004).
 */
export async function findMeal(
  organizationId: string,
  mealId: string,
): Promise<Meal | null> {
  const row = await queryOne<MealRow>(
    `SELECT ${MEAL_COLUMNS} FROM meals WHERE id = $2 AND organization_id = $1`,
    [organizationId, mealId],
  );
  return row ? toMeal(row) : null;
}

export async function setMealArchived(
  organizationId: string,
  mealId: string,
  archived: boolean,
): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `UPDATE meals
        SET archived_at = CASE WHEN $3 THEN COALESCE(archived_at, now()) ELSE NULL END
      WHERE id = $2 AND organization_id = $1
      RETURNING id`,
    [organizationId, mealId, archived],
  );
  return rows.length > 0;
}
