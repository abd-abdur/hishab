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
        // Statement analysis fans out multiple model calls per upload;
        // give the server functions room beyond the 10s default.
        functions: { maxDuration: 300 },
      },
    }),
    viteReact(),
    tailwindcss(),
  ],
  server: {
    port: 8080,
  },
});
