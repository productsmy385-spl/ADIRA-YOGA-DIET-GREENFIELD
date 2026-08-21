import { NextResponse } from "next/server";

import { pool } from "@/server/db/pool";

/**
 * Liveness and readiness probe, used by Railway's healthcheck (railway.json).
 *
 * It checks the database, because an application that cannot reach PostgreSQL is not
 * healthy in any sense a load balancer should care about — every meaningful request
 * needs it.
 *
 * The response body is deliberately thin. A health endpoint is unauthenticated and
 * therefore public, so it must not report versions, hostnames, connection strings, or
 * error text: that is free reconnaissance. The failure case says "the database check
 * failed" and nothing more; the detail goes to the server log where it belongs.
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    await pool.query("SELECT 1");
    return NextResponse.json({ status: "ok" }, { status: 200 });
  } catch (error) {
    console.error("[health] database check failed", error);
    return NextResponse.json({ status: "degraded" }, { status: 503 });
  }
}
