import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  esbuild: { jsx: "automatic" },
  test: {
    // The stores compute the data/ path from process.cwd(): each file needs its own process (forks) to chdir.
    pool: "forks",
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
    setupFiles: ["tests/setup.ts"],
    mockReset: true,
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      // Vendored third-party code: not covered by our tests.
      exclude: ["src/lib/nms-core/**", "src/**/*.d.ts"],
      reporter: ["text-summary", "text", "html", "lcov", "json-summary"],
      reportsDirectory: "coverage",
      // Just below the current coverage: a drop fails npm run test:coverage and CI.
      thresholds: { lines: 99.5, statements: 99.4, functions: 98.5, branches: 99.3 },
    },
  },
});
