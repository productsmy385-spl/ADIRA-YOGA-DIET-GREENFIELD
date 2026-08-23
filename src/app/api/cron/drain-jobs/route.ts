import { randomUUID } from "node:crypto";

import { cronUnauthorised, isAuthorisedCronRequest } from "@/server/http/cron-auth";
import {
  claim,
  purgeCompleted,
  queueDepth,
  releaseStalled,
  runJob,
  type Job,
} from "@/server/repositories/jobs";
import { createNotification } from "@/server/repositories/notifications";
import {
  generateCustomerWeekly,
  notifyReportReady,
} from "@/server/services/reports";

export const dynamic = "force-dynamic";
// The drain does bounded work per invocation, so it stays well inside a request. That is
// ADR-003's constraint made concrete: a job must be completable inside an HTTP request,
// and long work is expressed as many small jobs rather than one long one.
export const maxDuration = 60;

/** How many jobs one invocation will attempt. */
const BATCH = 25;

type Handler = (job: Job) => Promise<void>;

/**
 * The job handlers.
 *
 * Keyed by `jobs.type`. An unknown type throws, which fails the job and eventually moves
 * it to DEAD — deliberately, rather than silently succeeding. A queue that quietly
 * discards work it does not recognise is how a renamed job type becomes a feature that
 * stopped running and nobody noticed.
 */
const HANDLERS: Record<string, Handler> = {
  "report.customer-weekly": async (job) => {
    const { organizationId } = job;
    const customerId = job.payload.customerId as string;
    const start = job.payload.periodStart as string;
    const end = job.payload.periodEnd as string;

    if (!organizationId || !customerId || !start || !end) {
      throw new Error("report.customer-weekly requires organizationId, customerId, period");
    }

    const { payload } = await generateCustomerWeekly(organizationId, customerId, {
      start,
      end,
    });

    // After the report is stored, so a retry of the generation cannot send twice.
    await notifyReportReady(organizationId, customerId, payload, { start, end });
  },

  "notification.send": async (job) => {
    const { organizationId } = job;
    const recipientId = job.payload.recipientId as string;
    const kind = job.payload.kind as never;
    const title = job.payload.title as string;

    if (!organizationId || !recipientId || !kind || !title) {
      throw new Error("notification.send requires organizationId, recipientId, kind, title");
    }

    await createNotification({
      organizationId,
      recipientId,
      kind,
      title,
      body: (job.payload.body as string) ?? null,
      link: (job.payload.link as string) ?? null,
      senderId: (job.payload.senderId as string) ?? null,
    });
  },
};

/**
 * Drain the queue.
 *
 * Called by Railway Cron. Record the schedule in `docs/RAILWAY.md` when it is created —
 * schedules live in the dashboard and are invisible to git, which R8 identifies as the
 * reason a stalled drain is otherwise undetectable.
 *
 * The response reports what happened rather than a bare 200. A cron endpoint that always
 * says "ok" tells the operator nothing, and the numbers here are what make a queue that
 * has quietly stopped draining visible in the invocation log.
 */
export async function POST(request: Request) {
  if (!isAuthorisedCronRequest(request)) return cronUnauthorised();

  const drainId = randomUUID();

  // Before claiming: recover jobs whose drain was killed mid-flight. A deploy during a
  // batch would otherwise strand them in RUNNING forever, with no symptom but a report
  // that never arrives.
  const released = await releaseStalled();

  const jobs = await claim(BATCH, drainId);

  let succeeded = 0;
  let requeued = 0;
  let dead = 0;

  for (const job of jobs) {
    const handler = HANDLERS[job.type];

    const outcome = await runJob(job, async (claimed) => {
      if (!handler) throw new Error(`No handler registered for job type "${claimed.type}"`);
      await handler(claimed);
    });

    if (outcome === "SUCCEEDED") succeeded += 1;
    else if (outcome === "DEAD") dead += 1;
    else requeued += 1;
  }

  const purged = await purgeCompleted();
  const depth = await queueDepth();

  return Response.json({
    claimed: jobs.length,
    succeeded,
    requeued,
    dead,
    released,
    purged,
    depth,
  });
}
