import type { CustomerWeeklyPayload } from "@/server/services/reports";

/**
 * The contents of a weekly report, rendered.
 *
 * WHY THIS EXISTS
 *
 * `generateCustomerWeekly` freezes a genuinely useful payload — overall adherence, yoga
 * and diet split out, completed/missed/skipped counts, check-ins, and the change against
 * the previous week. Both report surfaces listed the period, the kind and the status, and
 * showed none of it. A member opening Reports saw a row saying a report existed.
 *
 * THE PAYLOAD IS READ, NOT RECOMPUTED.
 *
 * Everything here comes from `reports.payload` as frozen at generation. Recomputing on
 * view would let last week's figures move when somebody marks an old activity complete,
 * and a weekly report whose contents change is not a report (the same reasoning as
 * ADR-009, applied to time). So this component takes values and does no arithmetic beyond
 * formatting.
 *
 * NULL IS NOT ZERO.
 *
 * `completionPercent` returns null when nothing was scheduled, and that distinction
 * survives all the way here: a week with no plan shows "—", never "0%". Rendering zero
 * would tell somebody they failed a week in which nothing was asked of them, which is the
 * single most corrosive thing an adherence figure can do (docs/METRICS.md).
 */

/**
 * Narrow the JSONB column to the payload shape.
 *
 * `reports.payload` is `Record<string, unknown>` because that is honestly what comes back
 * from the database — a row written by an older version of the generator is not
 * guaranteed to match today's interface. So every field is checked rather than asserted,
 * and anything unrecognised renders as "no data" instead of throwing inside a page.
 */
function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function readWeeklyPayload(
  payload: Record<string, unknown>,
): Partial<CustomerWeeklyPayload> {
  return {
    adherencePercent: num(payload.adherencePercent),
    yogaPercent: num(payload.yogaPercent),
    dietPercent: num(payload.dietPercent),
    completed: num(payload.completed) ?? 0,
    missed: num(payload.missed) ?? 0,
    skipped: num(payload.skipped) ?? 0,
    checkIns: num(payload.checkIns) ?? 0,
    changeVsPreviousWeek: num(payload.changeVsPreviousWeek),
  };
}

function Percent({ label, value }: { label: string; value: number | null | undefined }) {
  return (
    <div>
      <dt className="text-xs tracking-widest text-muted-foreground uppercase">{label}</dt>
      <dd className="mt-1 text-xl font-semibold tabular-nums text-card-foreground">
        {value === null || value === undefined ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          `${value}%`
        )}
      </dd>
    </div>
  );
}

export function ReportSummary({ payload }: { payload: Record<string, unknown> }) {
  const p = readWeeklyPayload(payload);

  const scheduled = (p.completed ?? 0) + (p.missed ?? 0) + (p.skipped ?? 0);

  // Nothing was scheduled, so there is nothing to report. Saying so beats four dashes and
  // a row of zeroes, which reads as a failed week rather than an empty one.
  if (scheduled === 0 && (p.checkIns ?? 0) === 0) {
    return (
      <p className="mt-4 text-sm/relaxed text-muted-foreground">
        Nothing was scheduled in this period, so there is no adherence to report.
      </p>
    );
  }

  const change = p.changeVsPreviousWeek;

  return (
    <>
      <dl className="mt-4 grid grid-cols-3 gap-4">
        <Percent label="Overall" value={p.adherencePercent} />
        {/* Yoga and diet are never averaged into one figure: they fail for different
            reasons, and blending them hides the recognisable case of somebody practising
            faithfully while eating badly. */}
        <Percent label="Yoga" value={p.yogaPercent} />
        <Percent label="Diet" value={p.dietPercent} />
      </dl>

      <p className="mt-4 text-sm text-muted-foreground">
        {p.completed} completed · {p.missed} missed · {p.skipped} skipped ·{" "}
        {p.checkIns} check-in{p.checkIns === 1 ? "" : "s"}
      </p>

      {change !== null && change !== undefined && (
        /* Direction in words as well as sign — "up 4 points" survives being read aloud,
           and a bare "+4" does not say what it is four of. */
        <p className="mt-1 text-sm text-muted-foreground">
          {change === 0
            ? "Unchanged from the previous week."
            : `${change > 0 ? "Up" : "Down"} ${Math.abs(change)} point${
                Math.abs(change) === 1 ? "" : "s"
              } on the previous week.`}
        </p>
      )}
    </>
  );
}
