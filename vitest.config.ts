import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    exclude: ["node_modules"],
    // A few context-boundary tests intentionally change process.cwd(); keep test files isolated so global cwd cannot leak across files.
    fileParallelism: false,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts", "tools/**/*.ts"],
      exclude: ["src/types.ts", "src/sdk.ts", "src/asset-paths.ts"],
      reporter: ["text", "lcov"],
      thresholds: {
        // Ratchet: only raise these, never lower. Global floor reflects the
        // largely contract-tested tools/ surface; src/ keeps the stricter bar.
        lines: 30,
        functions: 25,
        branches: 55,
        statements: 30,
        "src/**/*.ts": {
          lines: 55,
          functions: 50,
          branches: 75,
          statements: 55,
        },
        "tools/lib/**/*.ts": {
          lines: 50,
          functions: 40,
          branches: 70,
          statements: 50,
        },
      },
    },
  },
})
