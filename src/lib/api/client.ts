import "server-only";
import { auth } from "@/auth";
import { BACKEND_API_URL, type ApiRoute } from "./routes";

/** True when BACKEND_API_URL is set; otherwise the app runs on mock data. */
export const backendEnabled = BACKEND_API_URL !== undefined;

const TIMEOUT_MS = 15_000;

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Calls a route declared in `routes.ts` and returns its adapted data.
 * Sends the signed-in user's Google access token so the backend can read
 * their inbox. Never cached: emails change.
 */
export async function request<Args extends unknown[], Data>(
  route: ApiRoute<Args, Data>,
  ...args: Args
): Promise<Data> {
  if (!BACKEND_API_URL) throw new Error("BACKEND_API_URL is not set");

  const session = await auth();
  const path = route.path(...args);

  let res: Response;
  try {
    res = await fetch(BACKEND_API_URL + path, {
      method: route.method,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${session?.accessToken ?? ""}`,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    throw new Error(`Could not reach the backend for ${route.method} ${path}: ${(e as Error).message}`);
  }

  if (!res.ok) throw new ApiError(res.status, `${route.method} ${path} failed with ${res.status}`);
  return route.adapt(await res.json());
}
