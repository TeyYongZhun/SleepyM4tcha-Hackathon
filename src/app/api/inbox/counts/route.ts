import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import { getLiveCounts } from "@/lib/emails";

/**
 * GET /api/inbox/counts
 * The tab totals for a Gmail inbox, which is counted in the background: this returns what
 * has been counted so far (never waits on Gmail) and the tab bar asks again until `done`.
 * ?fresh=1 starts a recount straight away, so the numbers catch up with new mail on a reload.
 * Other sources have exact totals up front, so they get 204 here.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.error) return new Response("Not signed in", { status: 401 });

  // ?fresh=1: the page was just loaded (or the tab came back), so recount now
  const fresh = req.nextUrl.searchParams.get("fresh") === "1";
  const counts = await getLiveCounts({ fresh });
  if (!counts) return new Response(null, { status: 204 });
  return Response.json(counts, { headers: { "Cache-Control": "private, no-store" } });
}
