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
        // Ratchet: only raise these, never lower. Each floor sits a few points
        // under the measured value so an intentional refactor can land, while a
        // dropped test suite fails the build.
        lines: 50,
        functions: 52,
        branches: 64,
        statements: 50,
        "src/**/*.ts": {
          lines: 72,
          functions: 78,
          branches: 74,
          statements: 72,
        },
        "tools/lib/**/*.ts": {
          lines: 74,
          functions: 65,
          branches: 70,
          statements: 74,
        },
      },
    },
  },
})
