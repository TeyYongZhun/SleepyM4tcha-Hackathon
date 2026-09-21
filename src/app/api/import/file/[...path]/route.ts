import path from "node:path";
import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import { demoSource } from "@/lib/demo/source";

/**
 * GET /api/import/file/attachments/:name -- one imported attachment.
 *
 * The bundled sample lives in `public/dummy` and is served as a static file, but imported
 * files arrive after the build: a production server only serves the `public/` files that
 * existed when it was built, and on Vercel they are not on the filesystem at all. This
 * route reads them through the store, so an import opens the same way the sample does.
 *
 * Blob storage hands out public URLs, but they are not what is linked: going through here
 * keeps the attachment behind the same sign-in check and the same no-execute headers a
 * Gmail attachment gets.
 */

const MIME: Record<string, string> = {
  ".txt": "text/plain; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

const PREVIEWABLE = /^(application\/pdf|image\/|text\/)/;

const text = (body: string, status: number) => new Response(body, { status });

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/import/file/[...path]">) {
  const session = await auth();
  if (!session?.user) return text("Not signed in", 401);
  if (!session.demo) return text("Not found", 404);

  const parts = (await ctx.params).path;
  // Only the attachments folder, only a plain filename: no traversal, no reaching the JSON
  if (parts.length !== 2 || parts[0] !== "attachments") return text("Not found", 404);
  const name = parts[1];
  if (name !== path.basename(name) || name.startsWith(".")) return text("Not found", 404);

  const ext = path.extname(name).toLowerCase();
  const mime = MIME[ext];
  if (!mime) return text("Not found", 404);

  const src = await demoSource();
  if (!src.imported) return text("Not found", 404);

  let data: Buffer;
  try {
    data = await src.readAttachment(`attachments/${name}`);
  } catch {
    return text("Not found", 404);
  }

  const ascii = name.replace(/[^\x20-\x7e]|["\\]/g, "_");
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": mime,
      "Content-Length": String(data.length),
      "Content-Disposition": `${PREVIEWABLE.test(mime) ? "inline" : "attachment"}; filename="${ascii}"`,
      // Imported files come from outside the project and are served from our own origin, so
      // they get the same treatment as a Gmail attachment: never run as a page.
      "X-Content-Type-Options": "nosniff",
      ...(mime === "application/pdf" ? {} : { "Content-Security-Policy": "sandbox" }),
      "Cache-Control": "private, no-store",
    },
  });
}
