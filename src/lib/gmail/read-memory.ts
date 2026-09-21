import "server-only";
import fs from "node:fs";
import path from "node:path";

/**
 * Which Gmail messages this app has opened, per account, kept on the server's disk.
 *
 * "Read" used to live only in the browser (localStorage), which is one origin at a time:
 * open the app as localhost:3001 instead of :3000, or as 127.0.0.1, or in another browser,
 * and every dot came back. Gmail itself only learns it once the app has permission to
 * change a message (see GOOGLE_SCOPES), and until you sign in again to grant that, it
 * can't. This is the memory that doesn't depend on either: it survives sign-outs, other
 * browsers and server restarts, and is applied to the list before it is sent.
 */

const FILE = path.join(process.cwd(), ".data", "read-messages.json");
/** Per account; the oldest are forgotten first. Far more than an inbox page or two of unread mail. */
const MAX_PER_USER = 5000;

type Memory = Map<string, Set<string>>;

// On globalThis for the same reason as the message store: pages and API routes are bundled
// separately and would otherwise each hold their own copy, and one would never see the other's writes.
const g = globalThis as unknown as { __wayboxRead?: Memory };

function memory(): Memory {
  if (g.__wayboxRead) return g.__wayboxRead;
  const loaded: Memory = new Map();
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, "utf8")) as Record<string, string[]>;
    for (const [user, ids] of Object.entries(raw)) loaded.set(user, new Set(ids));
  } catch {} // no file yet, or unreadable: start empty
  return (g.__wayboxRead = loaded);
}

function save(mem: Memory) {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    const out: Record<string, string[]> = {};
    for (const [user, ids] of mem) out[user] = [...ids];
    fs.writeFileSync(FILE, JSON.stringify(out));
  } catch {} // read-only disk: it is still remembered until the server restarts
}

export const wasOpened = (userKey: string, id: string) => memory().get(userKey)?.has(id) ?? false;

export function rememberOpened(userKey: string, id: string) {
  const mem = memory();
  let ids = mem.get(userKey);
  if (!ids) mem.set(userKey, (ids = new Set()));
  if (ids.has(id)) return;
  ids.add(id);
  if (ids.size > MAX_PER_USER) ids.delete(ids.values().next().value!);
  save(mem);
}
