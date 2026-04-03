/**
 * Shared API response helpers for SvelteKit route handlers
 * Consistent error and status responses across all endpoints
 */

import { json, error } from "@sveltejs/kit";

/**
 * Return a validation error (400) response
 */
export const validationError = (message: string) =>
  json({ error: message }, { status: 400 });

/**
 * Return a server error (500) response
 */
export const serverError = (message = "Internal server error") =>
  error(500, message);

/**
 * Return a not found error (404) response
 */
export const notFoundError = (resource: string) =>
  error(404, `${resource} not found`);

/**
 * Return an unauthorized error (401) response
 */
export const unauthorizedError = (message = "Unauthorized") =>
  error(401, message);

/**
 * Return a forbidden error (403) response
 */
export const forbiddenError = (message = "Forbidden") => error(403, message);
