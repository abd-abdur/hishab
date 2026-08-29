import { defineConfig } from "@neon/config/v1";

/**
 * Neon services this app uses. Lakebase Postgres is implicit on every branch —
 * it is the only Neon service hishab consumes (auth is self-hosted better-auth
 * in our own tables, and file parsing happens in the browser, so no Neon Auth,
 * buckets, or functions are declared). With this file present, `neon env pull`
 * pulls exactly the Postgres vars and fails fast if a branch is missing them.
 */
export default defineConfig({});
