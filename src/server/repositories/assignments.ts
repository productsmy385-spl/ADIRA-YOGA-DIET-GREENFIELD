import { query, queryOne, transaction } from "@/server/db/pool";
import type {
  AssignmentStatusValue,
  ProgrammeKindValue,
} from "@/server/db/types";
import {
  formatDateColumn,
  generateSchedule,
  generatesSchedule,
} from "@/server/services/schedule";

/**
 * Customer plans — the snapshot side of ADR-009.
 *
 * `createAssignmentFromProgramme` is the function that decision exists for. It COPIES
 * the template's items into `assignment_items`, including their titles and instructions,
 * so that editing or archiving a library exercise afterwards cannot change what a
 * customer was already told to do.
 *
 * Every function takes `organizationId` first and it is never optional (ADR-004).
 */

export interface Assignment {
  id: string;
  organizationId: string;
  customerId: string;
  assignedBy: string | null;
  kind: ProgrammeKindValue;
  sourceProgrammeId: string | null;
  sourceVersion: number | null;
  name: string;
  startsOn: string;
  durationWeeks: number;
  status: AssignmentStatusValue;
  createdAt: Date;
}

interface AssignmentRow {
  id: string;
  organization_id: string;
  customer_id: string;
  assigned_by: string | null;
  kind: ProgrammeKindValue;
  source_programme_id: string | null;
  source_version: number | null;
  name: string;
  starts_on: Date;
  duration_weeks: number;
  status: AssignmentStatusValue;
  created_at: Date;
}

const COLUMNS = `
  id, organization_id, customer_id, assigned_by, kind, source_programme_id,
  source_version, name, starts_on, duration_weeks, status, created_at
`;

function toAssignment(row: AssignmentRow): Assignment {
  return {
    id: row.id,
    organizationId: row.organization_id,
    customerId: row.customer_id,
    assignedBy: row.assigned_by,
    kind: row.kind,
    sourceProgrammeId: row.source_programme_id,
    sourceVersion: row.source_version,
    name: row.name,
    startsOn: formatDateColumn(row.starts_on),
    durationWeeks: row.duration_weeks,
    status: row.status,
    createdAt: row.created_at,
  };
}

export interface CreateAssignmentInput {
  organizationId: string;
  customerId: string;
  assignedBy: string | null;
  programmeId: string;
  startsOn: string;
  /** Defaults to the template's own duration. */
  durationWeeks?: number;
}

/**
 * Assign a programme to a customer, snapshotting it.
 *
 * One transaction: the assignment row and every copied item land together, or neither
 * does. A half-copied plan would show a customer a programme missing its later weeks and
 * would score their adherence against it.
 *
 * The copy happens in SQL rather than by reading rows into JavaScript and writing them
 * back. That is not only faster — it means the snapshot cannot be partially applied by a
 * process that dies midway, and the `WHERE programme_id` filter is evaluated once,
 * atomically, against the same view of the data the assignment was created from.
 */
export async function createAssignmentFromProgramme(
  input: CreateAssignmentInput,
): Promise<Assignment> {
  return transaction(async (client) => {
    const programme = await client.query<{
      name: string;
      kind: ProgrammeKindValue;
      duration_weeks: number;
      version: number;
    }>(
      `SELECT name, kind, duration_weeks, version
         FROM programmes
        WHERE id = $1 AND organization_id = $2 AND archived_at IS NULL`,
      [input.programmeId, input.organizationId],
    );

    if (programme.rowCount === 0) {
      // Scoped by organization, so this is also the cross-tenant answer: a programme in
      // another organisation is indistinguishable from one that does not exist.
      throw new Error("Programme not found.");
    }

    const template = programme.rows[0];

    const created = await client.query<AssignmentRow>(
      `INSERT INTO assignments
         (organization_id, customer_id, assigned_by, kind, source_programme_id,
          source_version, name, starts_on, duration_weeks, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'DRAFT')
       RETURNING ${COLUMNS}`,
      [
        input.organizationId,
        input.customerId,
        input.assignedBy,
        template.kind,
        input.programmeId,
        template.version,
        template.name,
        input.startsOn,
        input.durationWeeks ?? template.duration_weeks,
      ],
    );

    const assignment = toAssignment(created.rows[0]);

    // THE SNAPSHOT. Titles and instructions are copied, not referenced — that is the
    // whole of ADR-009. `source_*_id` is provenance and is never read to render a plan.
    await client.query(
      `INSERT INTO assignment_items
         (organization_id, assignment_id, week_number, day_of_week, sequence,
          title, instructions, breathing, quantity,
          duration_seconds, repetitions, slot, notes,
          source_yoga_exercise_id, source_meal_id, media_asset_id, model_reference)
       SELECT
         $1, $2, pi.week_number, pi.day_of_week, pi.sequence,
         COALESCE(ye.name, m.name),
         COALESCE(ye.instructions, m.instructions),
         ye.breathing,
         m.quantity,
         COALESCE(pi.duration_seconds, ye.default_duration_seconds),
         COALESCE(pi.repetitions, ye.default_repetitions),
         COALESCE(pi.slot, m.slot),
         pi.notes,
         pi.yoga_exercise_id, pi.meal_id,
         COALESCE(ye.media_asset_id, m.media_asset_id),
         ye.model_reference
       FROM programme_items pi
       LEFT JOIN yoga_exercises ye ON ye.id = pi.yoga_exercise_id
       LEFT JOIN meals m          ON m.id  = pi.meal_id
      WHERE pi.programme_id = $3
        AND pi.organization_id = $1
        AND pi.week_number <= $4`,
      [
        input.organizationId,
        assignment.id,
        input.programmeId,
        assignment.durationWeeks,
      ],
    );

    return assignment;
  });
}

/**
 * Activate an assignment and materialise its schedule.
 *
 * Idempotent by way of `ON CONFLICT DO NOTHING` against the `(assignment_id,
 * scheduled_for, assignment_item_id)` unique constraint: re-running after a partial
 * failure fills the gaps rather than doubling a day's activities, which would halve the
 * customer's adherence.
 *
 * Existing rows are left untouched, so a customer who already completed a day does not
 * have that completion reset by a regeneration.
 */
export async function activateAssignment(
  organizationId: string,
  assignmentId: string,
): Promise<{ activitiesCreated: number }> {
  return transaction(async (client) => {
    const found = await client.query<AssignmentRow>(
      `SELECT ${COLUMNS} FROM assignments
        WHERE id = $1 AND organization_id = $2
        FOR UPDATE`,
      [assignmentId, organizationId],
    );

    if (found.rowCount === 0) throw new Error("Assignment not found.");

    const assignment = toAssignment(found.rows[0]);

    if (assignment.status !== "ACTIVE") {
      await client.query(
        `UPDATE assignments SET status = 'ACTIVE' WHERE id = $1 AND organization_id = $2`,
        [assignmentId, organizationId],
      );
    }

    if (!generatesSchedule("ACTIVE")) return { activitiesCreated: 0 };

    const items = await client.query<{
      id: string;
      week_number: number;
      day_of_week: number;
      sequence: number;
    }>(
      `SELECT id, week_number, day_of_week, sequence
         FROM assignment_items
        WHERE assignment_id = $1 AND organization_id = $2`,
      [assignmentId, organizationId],
    );

    const schedule = generateSchedule({
      startsOn: assignment.startsOn,
      durationWeeks: assignment.durationWeeks,
      items: items.rows.map((row) => ({
        id: row.id,
        weekNumber: row.week_number,
        dayOfWeek: row.day_of_week,
        sequence: row.sequence,
      })),
    });

    if (schedule.length === 0) return { activitiesCreated: 0 };

    // One statement rather than a round trip per activity. A 4-week daily programme is
    // 28 rows; a 12-week one with three sessions a day is 252, and that many sequential
    // inserts over a remote connection is a visible pause in the consultant's UI.
    const values: unknown[] = [organizationId, assignment.customerId, assignmentId, assignment.kind];
    const tuples = schedule.map((entry, index) => {
      values.push(entry.scheduledFor, entry.item.id);
      return `($1, $2, $3, $4, $${index * 2 + 5}::date, $${index * 2 + 6})`;
    });

    const inserted = await client.query(
      `INSERT INTO daily_activities
         (organization_id, customer_id, assignment_id, kind, scheduled_for, assignment_item_id)
       VALUES ${tuples.join(", ")}
       ON CONFLICT (assignment_id, scheduled_for, assignment_item_id) DO NOTHING`,
      values,
    );

    return { activitiesCreated: inserted.rowCount ?? 0 };
  });
}

export async function findAssignment(
  organizationId: string,
  assignmentId: string,
): Promise<Assignment | null> {
  const row = await queryOne<AssignmentRow>(
    `SELECT ${COLUMNS} FROM assignments WHERE id = $1 AND organization_id = $2`,
    [assignmentId, organizationId],
  );
  return row ? toAssignment(row) : null;
}

export async function listAssignmentsForCustomer(
  organizationId: string,
  customerId: string,
): Promise<Assignment[]> {
  const rows = await query<AssignmentRow>(
    `SELECT ${COLUMNS} FROM assignments
      WHERE organization_id = $1 AND customer_id = $2
      ORDER BY created_at DESC`,
    [organizationId, customerId],
  );
  return rows.map(toAssignment);
}

/**
 * Pause a plan.
 *
 * Future PENDING activities are deleted rather than left in place, because
 * `docs/METRICS.md` requires that a paused plan schedules nothing and therefore cannot
 * accumulate misses. Past activities — completed, skipped, or already missed — are left
 * exactly as they are: the record of what happened is not editable by a status change.
 */
export async function pauseAssignment(
  organizationId: string,
  assignmentId: string,
): Promise<void> {
  await transaction(async (client) => {
    await client.query(
      `UPDATE assignments SET status = 'PAUSED', paused_at = now()
        WHERE id = $1 AND organization_id = $2`,
      [assignmentId, organizationId],
    );

    await client.query(
      `DELETE FROM daily_activities
        WHERE assignment_id = $1 AND organization_id = $2
          AND status = 'PENDING' AND scheduled_for > current_date`,
      [assignmentId, organizationId],
    );
  });
}
