import { defineConfig } from "vitest/config";
import path from "node:path";

// Mirrors the "@/*" path alias from tsconfig.json — needed once any test
// file (directly or transitively) imports through that alias, since Vitest
// doesn't read tsconfig paths on its own.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
