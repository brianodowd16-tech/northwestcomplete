import { pool } from "@round/db";

export const dynamic = "force-dynamic";

/** For the host's health check: the app is up and can reach the database. */
export async function GET() {
  try {
    await pool().query("select 1");
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
