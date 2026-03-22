/**
 * Next.js instrumentation hook.
 *
 * NOTE: This file intentionally does NOT import any server-only modules.
 * Server initialization (cron, DB setup) is handled lazily in the API routes.
 * This avoids build failures due to native modules (better-sqlite3, node-cron)
 * being bundled for the Edge runtime by Next.js 14's instrumentation compiler.
 */
export async function register() {
  // Intentionally empty — initialization is done lazily via API routes.
  // See: src/app/api/prices/route.ts and src/app/api/update/route.ts
}
