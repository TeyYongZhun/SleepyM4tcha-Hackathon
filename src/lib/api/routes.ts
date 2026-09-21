import "server-only";
import type { Email } from "../types";
import type { Submission } from "../submission";
import { adaptEmail, adaptEmailList } from "./adapters";

/**
 * THE ROUTING FILE: every backend endpoint the frontend calls is declared here.
 *
 *   base URL      -> BACKEND_API_URL (env). Leave it unset to use the built-in mock data.
 *   endpoint      -> `path`: where to call it (relative to the base URL)
 *   data shape    -> `adapt`: turns the response JSON into the type the UI renders
 *
 * To integrate a new endpoint:
 *   1. add an entry to `routes` below (path + adapt),
 *   2. call it with `request(routes.<name>, ...args)` from `lib/emails.ts`
 *      (or any other server code),
 *   3. if the response shape is new, add its adapter to `adapters.ts`.
 *
 * Requests are made on the server and carry the user's Google access token as
 * `Authorization: Bearer <token>` (see `client.ts`).
 */

/** Backend origin, without a trailing slash. Unset = mock data mode. */
export const BACKEND_API_URL = process.env.BACKEND_API_URL?.replace(/\/+$/, "") || undefined;

export interface ApiRoute<Args extends unknown[], Data> {
  method: "GET" | "POST";
  /** Path (and query string) for the given arguments, starting with "/" */
  path: (...args: Args) => string;
  /** Maps the parsed JSON response to the frontend type */
  adapt: (raw: unknown) => Data;
  /** For a call that legitimately takes longer than the usual 15s */
  timeoutMs?: number;
}

/** Only for type inference: keeps `request(routes.x, ...)` fully typed. */
function defineRoute<Args extends unknown[], Data>(route: ApiRoute<Args, Data>) {
  return route;
}

export const routes = {
  /** All emails in the signed-in user's inbox, with their category and summary. */
  emails: defineRoute<[], Email[]>({
    method: "GET",
    path: () => "/emails",
    adapt: adaptEmailList,
  }),

  /** One email in full. */
  email: defineRoute<[emailId: string], Email>({
    method: "GET",
    path: (emailId) => `/emails/${encodeURIComponent(emailId)}`,
    adapt: adaptEmail,
  }),

  /**
   * Every email's category and SI-vs-BL verdict, in the shape of ground_truth.json. The
   * gateway compares every BL pair the first time it is asked, so it gets longer than a list.
   */
  submission: defineRoute<[], Submission>({
    method: "GET",
    path: () => "/submission",
    timeoutMs: 120_000,
    adapt: (raw) => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        throw new Error("The backend's /submission is not an object keyed by email id");
      }
      return raw as Submission;
    },
  }),

  // Example of adding more later:
  //
  // emailsByCategory: defineRoute<[category: string], Email[]>({
  //   method: "GET",
  //   path: (category) => `/emails?category=${encodeURIComponent(category)}`,
  //   adapt: adaptEmailList,
  // }),
};
