import { beforeEach, describe, expect, it } from "vitest";

import { query } from "@/server/db/pool";
import {
  claim,
  enqueue,
  fail,
  purgeCompleted,
  queueDepth,
  releaseStalled,
  runJob,
  succeed,
  type Job,
} from "@/server/repositories/jobs";
import { createOrganization } from "@/server/repositories/organizations";

import { hasTestDatabase, resetDatabase } from "./helpers/sql-db";

/**
 * ADR-003's queue, proved against a real database.
 *
 * The properties that matter are all concurrency properties, and none of them can be
 * demonstrated by reading the code — SKIP LOCKED either hands two drains disjoint work
 * or it does not.
 */

const describeWithDatabase = hasTestDatabase ? describe : describe.skip;

describeWithDatabase("job queue", () => {
  let orgId: string;

  beforeEach(async () => {
    await resetDatabase();
    orgId = (await createOrganization({ name: "Studio", slug: "studio" })).id;
  });

  it("enqueues and claims a job", async () => {
    await enqueue({ type: "test.job", organizationId: orgId, payload: { a: 1 } });

    const claimed = await claim(10, "drain-1");
    expect(claimed).toHaveLength(1);
    expect(claimed[0].type).toBe("test.job");
    expect(claimed[0].payload).toEqual({ a: 1 });
    // The attempt is counted at claim time, so a drain that dies mid-job still burns one.
    expect(claimed[0].attempts).toBe(1);
  });

  /**
   * THE POINT OF SKIP LOCKED.
   *
   * Two overlapping cron invocations must take DISJOINT work. Without FOR UPDATE they
   * would both take everything and run every job twice; without SKIP LOCKED the second
   * would block on the first's row locks and the two would serialise.
   */
  it("hands two concurrent drains disjoint jobs", async () => {
    for (let i = 0; i < 6; i += 1) {
      await enqueue({ type: "test.job", organizationId: orgId, payload: { i } });
    }

    const [first, second] = await Promise.all([claim(3, "drain-a"), claim(3, "drain-b")]);

    const ids = [...first, ...second].map((j) => j.id);
    expect(ids).toHaveLength(6);
    expect(new Set(ids).size).toBe(6);
  });

  it("does not claim a job scheduled for the future", async () => {
    await enqueue({
      type: "test.job",
      organizationId: orgId,
      runAfter: new Date(Date.now() + 3_600_000),
    });

    expect(await claim(10, "drain-1")).toHaveLength(0);
  });

  it("does not re-claim a job already running", async () => {
    await enqueue({ type: "test.job", organizationId: orgId });

    expect(await claim(10, "drain-1")).toHaveLength(1);
    expect(await claim(10, "drain-2")).toHaveLength(0);
  });

  it("marks a job succeeded", async () => {
    await enqueue({ type: "test.job", organizationId: orgId });
    const [job] = await claim(1, "drain-1");
    await succeed(job.id);

    const depth = await queueDepth();
    expect(depth.queued).toBe(0);
    expect(depth.running).toBe(0);
  });

  // Retrying immediately would spend the whole attempt budget inside a brief outage.
  it("requeues a failure with a backoff, not immediately", async () => {
    await enqueue({ type: "test.job", organizationId: orgId, maxAttempts: 3 });
    const [job] = await claim(1, "drain-1");

    expect(await fail(job, "boom")).toBe("QUEUED");

    // Deferred, so a drain running right now must not pick it back up.
    expect(await claim(10, "drain-2")).toHaveLength(0);

    const [row] = await query<{ status: string; last_error: string }>(
      `SELECT status, last_error FROM jobs WHERE id = $1`,
      [job.id],
    );
    expect(row.status).toBe("QUEUED");
    expect(row.last_error).toBe("boom");
  });

  it("moves a job to DEAD once its attempts are exhausted", async () => {
    await enqueue({ type: "test.job", organizationId: orgId, maxAttempts: 1 });
    const [job] = await claim(1, "drain-1");

    expect(await fail(job, "final")).toBe("DEAD");
    expect((await queueDepth()).dead).toBe(1);
  });

  it("truncates a very long error rather than storing it whole", async () => {
    await enqueue({ type: "test.job", organizationId: orgId });
    const [job] = await claim(1, "drain-1");
    await fail(job, "x".repeat(10_000));

    const [row] = await query<{ last_error: string }>(
      `SELECT last_error FROM jobs WHERE id = $1`,
      [job.id],
    );
    expect(row.last_error.length).toBeLessThanOrEqual(2000);
  });

  /**
   * A drain killed mid-batch — a deploy, a timeout — leaves rows RUNNING forever, and
   * the only symptom is a report that never arrives.
   */
  it("releases jobs stranded in RUNNING by a drain that died", async () => {
    await enqueue({ type: "test.job", organizationId: orgId });
    const [job] = await claim(1, "drain-1");

    await query(
      `UPDATE jobs SET locked_at = now() - interval '30 minutes' WHERE id = $1`,
      [job.id],
    );

    expect(await releaseStalled(15)).toBe(1);
    expect(await claim(10, "drain-2")).toHaveLength(1);
  });

  it("does not release a job that is still within its lock window", async () => {
    await enqueue({ type: "test.job", organizationId: orgId });
    await claim(1, "drain-1");

    expect(await releaseStalled(15)).toBe(0);
  });

  it("kills a stranded job that has no attempts left", async () => {
    await enqueue({ type: "test.job", organizationId: orgId, maxAttempts: 1 });
    const [job] = await claim(1, "drain-1");

    await query(
      `UPDATE jobs SET locked_at = now() - interval '30 minutes' WHERE id = $1`,
      [job.id],
    );
    await releaseStalled(15);

    const [row] = await query<{ status: string }>(
      `SELECT status FROM jobs WHERE id = $1`,
      [job.id],
    );
    expect(row.status).toBe("DEAD");
  });
});

describeWithDatabase("runJob", () => {
  let orgId: string;

  beforeEach(async () => {
    await resetDatabase();
    orgId = (await createOrganization({ name: "Studio", slug: "studio" })).id;
  });

  async function oneJob(): Promise<Job> {
    await enqueue({ type: "test.job", organizationId: orgId, maxAttempts: 2 });
    const [job] = await claim(1, "drain-1");
    return job;
  }

  it("succeeds when the handler resolves", async () => {
    expect(await runJob(await oneJob(), async () => {})).toBe("SUCCEEDED");
  });

  // One failing job must not abort the drain and leave the rest of the batch claimed.
  it("catches a throwing handler and requeues rather than propagating", async () => {
    const outcome = await runJob(await oneJob(), async () => {
      throw new Error("handler exploded");
    });
    expect(outcome).toBe("QUEUED");
  });

  it("records the handler's message on the job", async () => {
    const job = await oneJob();
    await runJob(job, async () => {
      throw new Error("specific failure");
    });

    const [row] = await query<{ last_error: string }>(
      `SELECT last_error FROM jobs WHERE id = $1`,
      [job.id],
    );
    expect(row.last_error).toBe("specific failure");
  });
});

describeWithDatabase("purgeCompleted", () => {
  beforeEach(resetDatabase);

  it("removes old successes and keeps failures", async () => {
    const org = await createOrganization({ name: "Studio", slug: "studio" });

    await enqueue({ type: "old.success", organizationId: org.id });
    await enqueue({ type: "dead.one", organizationId: org.id, maxAttempts: 1 });

    const claimed = await claim(2, "drain-1");
    await succeed(claimed[0].id);
    await fail(claimed[1], "gone");

    await query(
      `UPDATE jobs SET completed_at = now() - interval '30 days' WHERE status = 'SUCCEEDED'`,
    );

    expect(await purgeCompleted(7)).toBe(1);
    // A dead job is evidence of a feature that stopped working; it is never purged.
    expect((await queueDepth()).dead).toBe(1);
  });
});
