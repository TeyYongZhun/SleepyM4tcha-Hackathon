import { auth } from "@/auth";
import { getSubmission } from "@/lib/emails";

/**
 * GET /api/export
 * Downloads submission.json: every email's category and SI-vs-BL verdict as the app has it
 * right now, in the shape of ground_truth.json, ready to be scored against it.
 * What is included depends on the inbox the account shows (see getSubmission).
 */
export async function GET() {
  const session = await auth();
  if (!session?.user || session.error) return new Response("Not signed in", { status: 401 });

  try {
    const submission = await getSubmission();
    return new Response(JSON.stringify(submission, null, 2) + "\n", {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": 'attachment; filename="submission.json"',
        "Cache-Control": "private, no-store",
        // For the button to say how many were exported
        "X-Export-Count": String(Object.keys(submission).length),
      },
    });
  } catch (e) {
    console.error("[export]", e);
    return new Response("Could not build the export", { status: 502 });
  }
}
