import "server-only";

/**
 * Whether the Python gateway (CLASSIFIER_API_URL) is worth asking right now.
 *
 * Every Gmail message is classified there and every SI/BL pair compared there, each behind a
 * timeout with the built-in rules as the fallback. That kept a gateway that is down harmless
 * for correctness but not for speed: a host that is asleep or unreachable doesn't refuse, it
 * just never answers, so each message on a page waited out its own timeout -- fifty of them,
 * eight at a time -- and opening an email waited out the comparison's. One failure now takes
 * the gateway out of the loop for a minute, so only the requests already in flight pay, and
 * everything after them goes straight to the rules until it is tried again.
 */
const RETRY_AFTER_MS = 60_000;

// On globalThis so every route bundle shares one answer (see lib/gmail for the same reason)
const g = globalThis as unknown as { __wayboxGatewayDownUntil?: number };

export const gatewayAvailable = (): boolean => Date.now() >= (g.__wayboxGatewayDownUntil ?? 0);

/**
 * A request to the gateway failed. `status` is the HTTP status when there was a response:
 * a 4xx is about that one request (a malformed file, say), not the gateway, so it doesn't count.
 */
export function gatewayFailed(status?: number): void {
  if (status !== undefined && status >= 400 && status < 500) return;
  g.__wayboxGatewayDownUntil = Date.now() + RETRY_AFTER_MS;
}
