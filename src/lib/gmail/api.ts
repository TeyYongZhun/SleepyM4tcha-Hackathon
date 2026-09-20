import "server-only";

// GMAIL_API_URL only exists so tests can point at a fake Gmail
const BASE = process.env.GMAIL_API_URL ?? "https://gmail.googleapis.com/gmail/v1/users/me";
const TIMEOUT_MS = 30_000;

/**
 * Gmail's quota is 15,000 units per minute per user, and messages.get costs 5:
 * about 50 messages a second at most, and the limit is per minute, not per second.
 * Pace to ~40/s (12,000 units/min) so a big download stays under it.
 */
const MIN_INTERVAL_MS = Number(process.env.GMAIL_MIN_INTERVAL_MS) || 25;
/** When quota is hit anyway, wait for the minute window to roll over. */
const QUOTA_BACKOFF_MS = [8_000, 16_000, 30_000];
const ERROR_RETRIES = 3;

export class GmailError extends Error {
  constructor(
    public status: number,
    message: string,
    /** Rate limit / quota exhausted (retrying later can succeed) */
    public quota = false,
  ) {
    super(message);
    this.name = "GmailError";
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Shared by every request in this server process
let nextStart = 0;
let pausedUntil = 0;

/** Spaces request starts MIN_INTERVAL_MS apart, and holds everyone while a quota pause is on. */
async function pace() {
  const at = Math.max(Date.now(), nextStart, pausedUntil);
  nextStart = at + MIN_INTERVAL_MS;
  const wait = at - Date.now();
  if (wait > 0) await sleep(wait);
}

/**
 * Against the Gmail API as the signed-in user. Paced under Gmail's quota;
 * on a quota error every request pauses (not just the failing one) and retries
 * after a backoff; 5xx errors retry briefly. Shared by gmailGet and gmailPost.
 */
async function gmailFetch<T>(
  token: string,
  method: "GET" | "POST",
  path: string,
  params: Record<string, string> = {},
  reqBody?: unknown,
): Promise<T> {
  const url = `${BASE}${path}?${new URLSearchParams(params)}`;

  for (let attempt = 0; ; attempt++) {
    await pace();
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(reqBody !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: reqBody !== undefined ? JSON.stringify(reqBody) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.ok) return res.status === 204 ? (undefined as T) : ((await res.json()) as T);

    const body = await res.text();
    const quota =
      res.status === 429 || (res.status === 403 && /quota|rate.?limit/i.test(body));

    let message = body.slice(0, 200);
    try {
      message = JSON.parse(body).error?.message ?? message;
    } catch {}

    const retryAfter = Number(res.headers.get("retry-after")) * 1000;
    if (quota && attempt < QUOTA_BACKOFF_MS.length) {
      const delay = retryAfter > 0 ? retryAfter : QUOTA_BACKOFF_MS[attempt];
      // All workers hit the wall together; pause and log once, not per request
      if (Date.now() + delay > pausedUntil + 1000) {
        console.warn(`[gmail] quota reached; pausing ${Math.round(delay / 1000)}s`);
      }
      pausedUntil = Math.max(pausedUntil, Date.now() + delay);
      continue;
    }
    if (res.status >= 500 && attempt < ERROR_RETRIES) {
      await sleep(500 * 2 ** attempt + Math.random() * 250);
      continue;
    }
    throw new GmailError(res.status, `Gmail API ${path} failed (${res.status}): ${message}`, quota);
  }
}

export function gmailGet<T>(token: string, path: string, params: Record<string, string> = {}): Promise<T> {
  return gmailFetch<T>(token, "GET", path, params);
}

export function gmailPost<T>(token: string, path: string, body?: unknown): Promise<T> {
  return gmailFetch<T>(token, "POST", path, {}, body);
}

/** Runs `fn` over `items` with at most `limit` in flight; results keep input order. */
export async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  let failed = false;
  const worker = async () => {
    while (!failed && next < items.length) {
      const i = next++;
      try {
        out[i] = await fn(items[i]);
      } catch (e) {
        failed = true; // stop the other workers from starting new requests
        throw e;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
