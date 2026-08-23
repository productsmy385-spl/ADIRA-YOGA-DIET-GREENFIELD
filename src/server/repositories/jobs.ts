import { query, queryOne, transaction } from "@/server/db/pool";
import type { JobStatusValue } from "@/server/db/types";

/**
 * The asynchronous work queue (ADR-003).
 *
 * A Postgres table drained by Railway Cron hitting `/api/cron/*`. No worker service and
 * no Redis: one datastore, one deploy, and a stuck job is visible to the same SQL as
 * everything else — debugging a late report is a SELECT, not attaching to a worker's
 * logs.
 *
 * `claim` is the load-bearing part. `FOR UPDATE SKIP LOCKED` is what lets two overlapping
 * cron invocations drain the same queue without either blocking or handing the same job
 * to both. Without SKIP LOCKED the second invocation waits on the first's row locks and
 * the two serialise; without FOR UPDATE they both take the same rows and every job runs
 * twice.
 */

export interface Job {
  id: string;
  organizationId: string | null;
  type: string;
  payload: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
}

interface JobRow {
  id: string;
  organization_id: string | null;
  type: string;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
}

export interface EnqueueInput {
  type: string;
  organizationId?: string | null;
  payload?: Record<string, unknown>;
  /** Defer the job. Defaults to immediately. */
  runAfter?: Date;
  maxAttempts?: number;
}

export async function enqueue(input: EnqueueInput): Promise<string> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO jobs (organization_id, type, payload, run_after, max_attempts)
     VALUES ($1, $2, $3::jsonb, COALESCE($4, now()), COALESCE($5, 5))
     RETURNING id`,
    [
      input.organizationId ?? null,
      input.type,
      JSON.stringify(input.payload ?? {}),
      input.runAfter ?? null,
      input.maxAttempts ?? null,
    ],
  );
  return row!.id;
}

/**
 * Claim up to `limit` due jobs, marking them RUNNING.
 *
 * `locked_by` identifies the drain that took them, so a job stuck in RUNNING can be
 * traced to a specific invocation rather than merely being known to be stuck.
 */
export async function claim(limit: number, lockedBy: string): Promise<Job[]> {
  const rows = await query<JobRow>(
    `WITH claimed AS (
       SELECT id FROM jobs
        WHERE status = 'QUEUED' AND run_after <= now()
        ORDER BY run_after
        FOR UPDATE SKIP LOCKED
        LIMIT $1
     )
     UPDATE jobs j
        SET status = 'RUNNING',
            locked_at = now(),
            locked_by = $2,
            attempts = j.attempts + 1
       FROM claimed c
      WHERE j.id = c.id
      RETURNING j.id, j.organization_id, j.type, j.payload, j.attempts, j.max_attempts`,
    [limit, lockedBy],
  );

  return rows.map((row) => ({
    id: row.id,
    organizationId: row.organization_id,
    type: row.type,
    payload: row.payload,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
  }));
}

export async function succeed(jobId: string): Promise<void> {
  await query(
    `UPDATE jobs SET status = 'SUCCEEDED', completed_at = now(), locked_by = NULL
      WHERE id = $1`,
    [jobId],
  );
}

/**
 * Record a failure, and decide whether to retry.
 *
 * Retries back off exponentially — 1, 2, 4, 8 minutes — because the usual cause of a
 * job failing is something transient and briefly unavailable. Retrying immediately
 * spends the whole attempt budget inside the outage window and lands the job in DEAD
 * before the dependency has had time to come back.
 *
 * Exhausting the budget moves it to DEAD rather than deleting it. A job nobody can see
 * failed is a feature that silently stopped working; the platform console counts these.
 */
export async function fail(job: Job, error: string): Promise<JobStatusValue> {
  const exhausted = job.attempts >= job.maxAttempts;
  const backoffMinutes = Math.min(2 ** (job.attempts - 1), 60);

  await query(
    `UPDATE jobs
        SET status = $2::job_status,
            last_error = $3,
            locked_by = NULL,
            run_after = CASE WHEN $2 = 'QUEUED'
                             THEN now() + ($4 || ' minutes')::interval
                             ELSE run_after END,
            completed_at = CASE WHEN $2 = 'DEAD' THEN now() ELSE NULL END
      WHERE id = $1`,
    [
      job.id,
      exhausted ? "DEAD" : "QUEUED",
      // Truncated: an error message is for diagnosis, and a megabyte of stack trace in
      // a queue row helps nobody and bloats every listing query.
      error.slice(0, 2000),
      String(backoffMinutes),
    ],
  );

  return exhausted ? "DEAD" : "QUEUED";
}

/**
 * Release jobs stuck in RUNNING.
 *
 * A drain that is killed mid-job — a deploy, a timeout, a crashed process — leaves its
 * claimed rows RUNNING forever, because nothing else will ever pick them up. Without
 * this sweep the queue silently loses work, and the only symptom is a report that never
 * arrives.
 *
 * The attempt was already counted at claim time, so a job that repeatedly kills its
 * drain still exhausts its budget rather than looping indefinitely.
 */
export async function releaseStalled(olderThanMinutes = 15): Promise<number> {
  const rows = await query<{ id: string }>(
    `UPDATE jobs
        SET status = (CASE WHEN attempts >= max_attempts THEN 'DEAD' ELSE 'QUEUED' END)::job_status,
            locked_by = NULL,
            last_error = COALESCE(last_error, 'Drain stopped before the job finished.')
      WHERE status = 'RUNNING'
        AND locked_at < now() - ($1 || ' minutes')::interval
      RETURNING id`,
    [String(olderThanMinutes)],
  );
  return rows.length;
}

/** Housekeeping: successful jobs are history nobody reads. Failures are kept. */
export async function purgeCompleted(olderThanDays = 7): Promise<number> {
  const rows = await query<{ id: string }>(
    `DELETE FROM jobs
      WHERE status = 'SUCCEEDED'
        AND completed_at < now() - ($1 || ' days')::interval
      RETURNING id`,
    [String(olderThanDays)],
  );
  return rows.length;
}

export interface QueueDepth {
  queued: number;
  running: number;
  dead: number;
}

export async function queueDepth(): Promise<QueueDepth> {
  const row = await queryOne<{ queued: string; running: string; dead: string }>(
    `SELECT
       count(*) FILTER (WHERE status = 'QUEUED')::text  AS queued,
       count(*) FILTER (WHERE status = 'RUNNING')::text AS running,
       count(*) FILTER (WHERE status = 'DEAD')::text    AS dead
     FROM jobs`,
  );
  return {
    queued: Number(row?.queued ?? 0),
    running: Number(row?.running ?? 0),
    dead: Number(row?.dead ?? 0),
  };
}

/**
 * Run one job to completion, recording the outcome either way.
 *
 * Errors are caught rather than propagated: one failing job must not abort the drain and
 * leave the rest of the batch claimed-but-unprocessed. The handler's failure is the
 * job's problem; the drain's job is to keep going.
 */
export async function runJob(
  job: Job,
  handler: (job: Job) => Promise<void>,
): Promise<"SUCCEEDED" | "QUEUED" | "DEAD"> {
  try {
    await handler(job);
    await succeed(job.id);
    return "SUCCEEDED";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const outcome = await fail(job, message);
    return outcome === "DEAD" ? "DEAD" : "QUEUED";
  }
}

/** Transactional enqueue, for callers already inside one. */
export async function enqueueMany(inputs: EnqueueInput[]): Promise<number> {
  if (inputs.length === 0) return 0;

  return transaction(async (client) => {
    let created = 0;
    for (const input of inputs) {
      await client.query(
        `INSERT INTO jobs (organization_id, type, payload, run_after, max_attempts)
         VALUES ($1, $2, $3::jsonb, COALESCE($4, now()), COALESCE($5, 5))`,
        [
          input.organizationId ?? null,
          input.type,
          JSON.stringify(input.payload ?? {}),
          input.runAfter ?? null,
          input.maxAttempts ?? null,
        ],
      );
      created += 1;
    }
    return created;
  });
}
