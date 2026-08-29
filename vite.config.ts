import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [
    tsConfigPaths(),
    tanstackStart(),
    nitro({
      vercel: {
        // maxDuration: statement analysis fans out multiple model calls.
        // regions: pin the functions next to the Neon database (Singapore) —
        // the default US region put an ocean between every query.
        functions: { maxDuration: 300, regions: ["sin1"] },
      },
    }),
    viteReact(),
    tailwindcss(),
  ],
  server: {
    port: 8080,
  },
});
