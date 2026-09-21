import { auth } from "@/auth";
import { getLiveCounts } from "@/lib/emails";

/**
 * GET /api/inbox/counts
 * The tab totals for a Gmail inbox, which is counted in the background: this returns what
 * has been counted so far (never waits on Gmail) and the tab bar asks again until `done`.
 * Other sources have exact totals up front, so they get 204 here.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user || session.error) return new Response("Not signed in", { status: 401 });

  const counts = await getLiveCounts();
  if (!counts) return new Response(null, { status: 204 });
  return Response.json(counts, { headers: { "Cache-Control": "private, no-store" } });
}
