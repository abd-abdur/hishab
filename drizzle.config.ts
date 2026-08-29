import { defineConfig } from "drizzle-kit";

// drizzle-kit doesn't auto-load .env; Node 22+ can.
try {
  process.loadEnvFile(".env");
} catch {
  /* no .env — rely on the ambient environment (CI, Vercel) */
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env["DATABASE_URL"] ?? "",
  },
});
