/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as alerts from "../alerts.js";
import type * as auth from "../auth.js";
import type * as auth_emailOtp from "../auth/emailOtp.js";
import type * as helpers from "../helpers.js";
import type * as http from "../http.js";
import type * as jobs from "../jobs.js";
import type * as locations from "../locations.js";
import type * as ppe from "../ppe.js";
import type * as scores from "../scores.js";
import type * as seed from "../seed.js";
import type * as sessions from "../sessions.js";
import type * as sops from "../sops.js";
import type * as users from "../users.js";
import type * as workers from "../workers.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  alerts: typeof alerts;
  auth: typeof auth;
  "auth/emailOtp": typeof auth_emailOtp;
  helpers: typeof helpers;
  http: typeof http;
  jobs: typeof jobs;
  locations: typeof locations;
  ppe: typeof ppe;
  scores: typeof scores;
  seed: typeof seed;
  sessions: typeof sessions;
  sops: typeof sops;
  users: typeof users;
  workers: typeof workers;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
